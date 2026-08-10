# Money Pal — Postgres Schema Design

A production-shaped relational schema to replace the mock seed layer, mapping to the domain types in `src/data/schema.ts`. Schema only: no UI changes and no repository swap in this step.

## Confirmed decisions

- User key: `auth.users` UUID. Every user-owned table carries `owner_id UUID NOT NULL DEFAULT auth.uid()`.
- Audit actor columns (`created_by`, `modified_by`) are UUIDs of the auth user.
- Multi-currency per account, presentation only — no FX table, no conversion. Cross-currency totals are grouped by currency, never summed together.
- Balances are always derived from `opening_balance_minor + SUM(transactions)`. No stored balance column, no balance trigger.
- Budgets are monthly only.
- Database starts empty apart from global lookup rows.
- Soft delete is universal: nothing is hard-deleted; every read filters `deleted_at IS NULL`.

## Transfers: the two models

**A. One row, `from_account_id` + `to_account_id`**

- Pros: one row per real-world event, impossible to half-delete, simplest to edit in the UI, matches today's mock most closely.
- Cons: every balance query must read the row twice (once as an outflow for `from`, once as an inflow for `to`), so account/category maths needs a UNION or a view instead of a plain `SUM(amount)`. Cross-currency transfers (INR → EUR Wise) need two different amounts on one row, which the single-row shape handles awkwardly. Splits and per-leg fees have nowhere to live.

**B. Two mirrored rows linked by `transfer_group_id`**

- Pros: the ledger stays uniform — one row = one account movement, so every balance, category, and report query is a single `SUM(amount_minor) WHERE account_id = …` with no special-casing. Cross-currency works naturally (−50,000 INR leg, +540 EUR leg). Per-leg fees and reconciliation flags fit without schema changes.
- Cons: two rows must be created, edited and soft-deleted together (handled by a `transfer` RPC and a trigger that cascades soft delete to the group). Reports must exclude transfer rows from income/expense totals, or they double-count.

**Recommendation, and what this plan assumes: B.** Your multi-currency requirement (an INR bank and a EUR Wise account) effectively decides it — a single row cannot hold two currencies cleanly, and "efficient maths" is exactly what the uniform one-row-per-movement ledger buys. Say the word if you want A instead.

## Conventions applied to every table

- `id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`; all FKs `INT`.
- Money: `BIGINT` minor units, column suffix `_minor`. Never float, never numeric for money.
- Genuinely fractional non-money values (holding units, confidence, percentages) use `NUMERIC(18,6)`.
- Audit block on every table: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `created_by UUID NOT NULL DEFAULT auth.uid()`, `modified_at TIMESTAMPTZ`, `modified_by UUID`, `deleted_at TIMESTAMPTZ`, `is_active BOOLEAN NOT NULL DEFAULT true`.
- RLS enabled on every table; user-owned tables use `owner_id = auth.uid()` for all four commands. Lookup tables are `SELECT`-only to `authenticated`. Explicit `GRANT`s ship in the same migration as each `CREATE TABLE`.
- Lookup tables over Postgres enums, so values stay extensible at runtime.

## Full object inventory

### Extensions
- `pg_trgm` — merchant search.

### Lookup tables (global, seeded, read-only to users)
1. `currency` — `code CHAR(3)` unique, `symbol`, `minor_unit_exponent SMALLINT`, `name`. Seeded: INR, EUR, USD, GBP, AED, SGD.
2. `account_kind` — bank, cash, credit_card, investment, loan.
3. `transaction_type` — income, expense, transfer.
4. `category_group` — income, essentials, lifestyle, transfer, investment.
5. `asset_class` — equity, mutual_fund, gold, fixed_income, crypto.
6. `timeline_kind` — money, ai_insight, goal, bill, system.
7. `import_source_kind` — gmail, pdf, csv, manual.
8. `import_review_kind` — duplicate, unknown_merchant, large_transfer.
9. `app_role` — user, admin (roles live in their own table, never on the profile).

### User-owned tables
10. `user_profile` — `owner_id` unique, display name, email, `base_currency_code`, week start, number format, round-to-nearest, theme, accent, sidebar state, reduce motion, assistant tone, assistant context flag.
11. `user_role` — `owner_id`, `app_role_id`, unique `(owner_id, app_role_id)`.
12. `category` — `owner_id`, name, `category_group_id`, icon, colour token. Unique `(owner_id, lower(name))`.
13. `label` — `owner_id`, name, colour token. Unique `(owner_id, lower(name))`.
14. `account` — `owner_id`, name, institution, `account_kind_id`, `currency_code`, `opening_balance_minor`, `credit_limit_minor` (nullable), `is_primary`, `last_activity_at`.
15. `transaction` — `owner_id`, `account_id`, `category_id`, `transaction_type_id`, `occurred_at TIMESTAMPTZ`, `occurred_on DATE GENERATED ALWAYS AS (occurred_at AT TIME ZONE 'Asia/Kolkata')::date STORED`, merchant, descriptor, `amount_minor BIGINT` (signed: negative = money out), `currency_code`, payment method, source, `confidence NUMERIC(4,3)`, note, `transfer_group_id INT NULL`.
16. `transfer_group` — `owner_id`, occurred_at, note. Parent of the two legs.
17. `transaction_label` — join table, unique `(transaction_id, label_id)`.
18. `attachment` — `transaction_id`, storage path, mime, `size_bytes`, original filename.
19. `budget` — `owner_id`, `period_month DATE` (always the 1st), unique `(owner_id, period_month)`.
20. `budget_line` — `budget_id`, `category_id`, `planned_minor`. Unique `(budget_id, category_id)`. Spend is never stored.
21. `goal` — `owner_id`, name, blurb, `target_minor`, `target_date`, `account_id`, `monthly_contribution_minor`, icon, `currency_code`.
22. `goal_contribution` — `goal_id`, `contributed_on DATE`, `amount_minor`, optional `transaction_id`. `saved` is the SUM.
23. `holding` — `owner_id`, `account_id`, name, `asset_class_id`, `units NUMERIC(18,6)`, `invested_minor`, `currency_code`.
24. `holding_valuation` — `holding_id`, `as_of_date DATE`, `market_value_minor`, `day_change_pct NUMERIC(8,4)`. Unique `(holding_id, as_of_date)`.
25. `account_balance_snapshot` — `account_id`, `as_of_date DATE`, `balance_minor`. Unique `(account_id, as_of_date)`. Cache for sparklines/net-worth history; the live balance is still derived.
26. `import_source` — `owner_id`, `import_source_kind_id`, name, status, `last_synced_at`.
27. `import_job` — `import_source_id`, title, `rows_done`, `rows_total`, `imported_count`, `duplicate_count`, `started_at`, `finished_at`.
28. `import_review_item` — `import_job_id`, `import_review_kind_id`, title, detail, action label, `resolved_at`, `resolution`.
29. `timeline_event` — `owner_id`, `occurred_at`, `timeline_kind_id`, title, detail, `amount_minor` nullable, `account_id` nullable, action label.
30. `assistant_conversation` — `owner_id`, title, `last_message_at`.
31. `assistant_message` — `conversation_id`, role, content, `token_count`.

### Views (all respect RLS through the underlying tables, defined `security_invoker = true`)
- `v_transaction_enriched` — transaction + account + category + type + label array, `period_month` precomputed, soft-deleted rows excluded.
- `v_account_balance` — `opening_balance_minor + COALESCE(SUM(amount_minor), 0)` per account, plus utilisation for credit cards.
- `v_net_worth_by_currency` — assets, liabilities, net per currency (never cross-summed).
- `v_monthly_rollup` — income, expense, net, savings rate per `period_month`, transfer rows excluded.
- `v_budget_status` — planned vs actual vs remaining vs pace per budget line.
- `v_goal_progress` — target, saved (sum of contributions), percent, months remaining.
- `v_portfolio_allocation` — invested, current value, gain, weight by asset class using the latest valuation per holding.
- `v_category_spend` — spend by category by month.

### Functions
- `fn_touch_audit()` — trigger function: stamps `created_by` on insert, `modified_at`/`modified_by` on update; blocks changing `owner_id`.
- `fn_soft_delete(table_name, id)` — helper marking `deleted_at = now()`, `is_active = false`.
- `fn_cascade_transfer_soft_delete()` — trigger on `transaction`: soft-deleting one leg soft-deletes its sibling in the same `transfer_group`.
- `has_role(_user_id uuid, _role text) RETURNS boolean` — `SECURITY DEFINER`, `STABLE`, `SET search_path = public`; used by admin policies so RLS never queries the policy's own table.
- `fn_account_balance(_account_id int) RETURNS bigint` — `STABLE`, single-account derived balance.
- `fn_current_month() RETURNS date` — first of the current month in Asia/Kolkata.
- `fn_record_balance_snapshots(_as_of date)` — recomputes and upserts `account_balance_snapshot` for the caller's accounts.
- `fn_create_transfer(_from_account_id int, _to_account_id int, _from_amount_minor bigint, _to_amount_minor bigint, _occurred_at timestamptz, _note text)` — `SECURITY INVOKER` RPC creating the `transfer_group` plus both legs atomically; validates both accounts belong to `auth.uid()`.
- `fn_ensure_budget(_period_month date) RETURNS int` — returns the budget for a month, creating it if absent.

### Triggers
- `trg_touch_audit` — BEFORE INSERT OR UPDATE on all 22 user-owned tables.
- `trg_transfer_soft_delete` — AFTER UPDATE OF `deleted_at` on `transaction`.
- `trg_account_activity` — AFTER INSERT on `transaction`, updates `account.last_activity_at`.
- `trg_profile_on_signup` — AFTER INSERT on `auth.users`, `SECURITY DEFINER`, creates `user_profile` plus a default `user_role` of `user` and the default category set for the new user.

### Indexes
- Every FK column indexed.
- `transaction (owner_id, occurred_at DESC) WHERE deleted_at IS NULL` — ledger scroll.
- `transaction (owner_id, category_id, occurred_on) WHERE deleted_at IS NULL` — category reports.
- `transaction (owner_id, account_id, occurred_on) WHERE deleted_at IS NULL` — per-account views and balances.
- `transaction (transfer_group_id) WHERE transfer_group_id IS NOT NULL`.
- GIN trigram on `transaction.merchant`.
- `budget_line (budget_id, category_id)` unique; `budget (owner_id, period_month)` unique.
- `holding_valuation (holding_id, as_of_date DESC)`; `account_balance_snapshot (account_id, as_of_date DESC)`.
- `timeline_event (owner_id, occurred_at DESC) WHERE deleted_at IS NULL`.
- Partial `is_active = true` indexes on the lookup-heavy tables.

### Constraints
- `transaction`: `CHECK (amount_minor <> 0)`; income rows positive, expense rows negative, enforced per `transaction_type_id`.
- `account`: `CHECK (credit_limit_minor IS NULL OR credit_limit_minor > 0)`; `credit_limit_minor` required for `credit_card` kind.
- `budget_line`, `goal`, `goal_contribution`: `CHECK (… _minor > 0)`.
- `budget.period_month`: `CHECK (period_month = date_trunc('month', period_month)::date)`.
- Transaction currency must match its account's currency.
- FKs to masters (`account`, `category`) use `ON DELETE RESTRICT`; child rows (`transaction_label`, `attachment`, `budget_line`, legs of a transfer) use `ON DELETE CASCADE` for the physical FK while soft delete remains the application path.

## Migration order

1. Enable Lovable Cloud (the app currently has no backend).
2. `01_foundation` — extensions, `fn_touch_audit`, `has_role`, all 9 lookup tables + seed rows + grants.
3. `02_identity` — `user_profile`, `user_role`, `trg_profile_on_signup`, RLS + grants.
4. `03_ledger` — `account`, `category`, `label`, `transfer_group`, `transaction`, `transaction_label`, `attachment`, triggers, constraints, indexes, RLS + grants.
5. `04_planning` — `budget`, `budget_line`, `goal`, `goal_contribution`, `holding`, `holding_valuation`, `account_balance_snapshot`, RLS + grants.
6. `05_workshop` — import tables, `timeline_event`, assistant tables, RLS + grants.
7. `06_analytics` — all views and the calculation functions.

The swap of `src/data/repository.ts` from seed arrays to server functions is a separate follow-up.

## Remaining open question

- Transfers: confirm model **B** (two mirrored legs) as described above, or tell me to use A.
