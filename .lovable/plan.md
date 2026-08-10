# Money Pal — Postgres Schema Design

A production-shaped relational schema to replace the mock seed layer, mapping 1:1 to the existing domain types in `src/data/schema.ts`. This plan is schema-only: no UI changes, no data swap yet.

## Ground rules applied everywhere

- **Money as integers.** Every amount is `BIGINT` holding minor units (paise), never `float`/`numeric` for storage. A `currency CHAR(3)` column sits next to any amount-bearing row. Percentages/units that are genuinely fractional (holding units, day-change %) use `NUMERIC(18,6)` — exact decimal, still not float.
- **Integer primary keys.** Every table uses `id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`. Foreign keys are `INT`. The only UUID in the design is `owner_id` referencing `auth.users(id)`, which the auth system fixes as UUID (see Open questions).
- **Audit columns on every table.**
  `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `created_by UUID`, `modified_at TIMESTAMPTZ`, `modified_by UUID`, `deleted_at TIMESTAMPTZ`, `is_active BOOLEAN NOT NULL DEFAULT true`.
  A shared trigger function stamps `modified_at`/`modified_by` on update and `created_by` on insert from `auth.uid()`. Deletes are soft: set `deleted_at` + `is_active = false`.
- **Normalization.** Enumerated concepts (account kinds, transaction types, categories, labels, asset classes, timeline kinds, import sources) become lookup tables with integer PKs rather than free text, so joins and grouping stay cheap. Postgres enums are avoided because they cannot be extended by the app at runtime.
- **RLS everywhere.** All app tables carry `owner_id UUID NOT NULL DEFAULT auth.uid()` and per-user policies (`owner_id = auth.uid()`) for select/insert/update/delete. Shared lookup tables are read-only to `authenticated`. Every `CREATE TABLE` ships with explicit `GRANT`s in the same migration.

## Tables

**Reference / lookup (global, read-only to users)**
- `currency` — code, symbol, minor-unit exponent.
- `account_kind` — bank, cash, credit_card, investment, loan.
- `transaction_type` — income, expense, transfer.
- `asset_class` — equity, mutual_fund, gold, fixed_income, crypto.
- `timeline_kind` — money, ai_insight, goal, bill, system.
- `import_source_kind` — gmail, pdf, csv, manual.
- `category_group` — income, essentials, lifestyle, transfer, investment.

**User-owned core**
- `app_user_profile` — display name, email, base currency, preferences (week start, number format, rounding, theme, accent, sidebar, reduce motion, assistant tone/context). One row per auth user.
- `user_role` — separate roles table (never a role column on the profile), with a `has_role()` security-definer helper.
- `category` — user-scoped, `category_group_id`, icon, colour token.
- `label` — user-scoped tag, colour token.
- `account` — name, institution, `account_kind_id`, `currency_code`, `credit_limit_minor`, `is_primary`, `opening_balance_minor`, `last_activity_at`.
- `transaction` — `occurred_at`, merchant, descriptor, `amount_minor` (signed), `transaction_type_id`, `account_id`, `category_id`, `payment_method`, `source`, `confidence`, `note`, `attachment_count`, plus `transfer_group_id` so the two legs of a transfer link to each other.
- `transaction_label` — many-to-many join (a transaction can carry more than one tag; today's model allows one).
- `attachment` — file metadata per transaction (path, mime, size, uploaded_at).

**Planning**
- `budget_period` — `period_start DATE` + `period_end DATE` (a real date range beats a `"2026-08"` string for indexing and range queries), scope (month/quarter/year).
- `budget_line` — `budget_period_id`, `category_id`, `planned_minor`. Spend is **not** stored; it is derived (see below).
- `goal` — name, blurb, `target_minor`, `target_date`, `account_id`, `monthly_contribution_minor`, icon.
- `goal_contribution` — dated contributions; `saved` is the sum, not a stored field.
- `holding` — name, `asset_class_id`, `units NUMERIC(18,6)`, `account_id`.
- `holding_valuation` — dated `invested_minor` / `market_value_minor` snapshots, so performance charts read history instead of a single mutable row.
- `account_balance_snapshot` — daily/periodic `balance_minor` per account; powers sparklines and net-worth history without recomputing the full ledger.

**Workshop**
- `import_source`, `import_job` (rows_done/rows_total/imported/duplicates/finished_at), `import_review_item` (kind, title, detail, action label, resolution state).
- `timeline_event` — `occurred_at`, `timeline_kind_id`, title, detail, `amount_minor`, `account_id`, action label.
- `assistant_conversation` / `assistant_message` — optional persistence for the AI Assistant.

## Making the maths cheap

- **Derived, not duplicated.** `budget_line.spent`, `goal.saved`, and account running balances are computed from the ledger rather than stored, so they can never drift.
- **Rollup views** do the aggregation once:
  - `v_transaction_enriched` — transaction joined to account, category, type, with `period_month DATE` precomputed.
  - `v_monthly_rollup` — income / expense / net per user per month.
  - `v_budget_status` — planned vs actual vs remaining per budget line.
  - `v_net_worth` — assets, liabilities, net, per snapshot date.
  - `v_portfolio_allocation` — value by asset class.
  If any of these become slow at real volume, `v_monthly_rollup` is the first candidate for a materialized view refreshed on write.
- **Integer arithmetic only.** All sums stay in minor units; division (savings rate, utilisation, allocation %) happens in the view with an explicit `NUMERIC` cast at the last step.

## Indexing

- Every FK gets an index.
- `transaction (owner_id, occurred_at DESC)` — the main ledger scroll.
- `transaction (owner_id, category_id, occurred_at)` — category breakdowns.
- `transaction (owner_id, account_id, occurred_at)` — per-account views.
- Partial indexes filtered on `deleted_at IS NULL` so soft-deleted rows cost nothing.
- `budget_line (owner_id, budget_period_id, category_id)` unique.
- `account_balance_snapshot (account_id, as_of_date)` unique.
- Trigram index on `transaction.merchant` for the search box.

## Constraints

- `CHECK` on sign conventions (expense amounts negative, income positive).
- `CHECK (credit_limit_minor IS NULL OR credit_limit_minor > 0)`.
- Unique `(owner_id, lower(name))` on `account`, `category`, `label`, `goal`.
- FKs use `ON DELETE RESTRICT` for referenced masters (accounts, categories) so soft-delete stays the only removal path.

## Delivery

1. Enable Lovable Cloud (the app has no backend yet).
2. Migration 1 — lookup tables + seed rows + grants.
3. Migration 2 — core user-owned tables, audit trigger, RLS policies, grants.
4. Migration 3 — planning/workshop tables, views, indexes.
5. Generated types are then available; the swap of `src/data/repository.ts` from seed arrays to server functions is a **separate follow-up**, not part of this plan.

## Open questions — please confirm, I have not assumed answers

1. **UUID vs INT for the user key.** You asked for INT primary keys. Auth users are UUID-keyed by the platform and cannot be changed. Preference: (a) `owner_id UUID` referencing `auth.users` directly on every table — simplest and standard; or (b) `app_user` table with an INT PK plus a UUID `auth_user_id`, and all FKs use the INT — matches your rule but adds a lookup join on every RLS policy. I lean (a) but will follow your call.
2. **Multi-currency.** Everything is INR today. Should the schema support per-account currency plus an `fx_rate` table for conversion, or stay single-currency with the column present but unused?
3. **Transfers.** Should a transfer be one row with `from_account_id`/`to_account_id`, or two mirrored rows linked by `transfer_group_id`? The second is more standard for ledger maths; the current mock uses a single signed row.
4. **Balance source of truth.** Should `account.balance` be a stored, trigger-maintained column (fast reads, needs care) or always derived from opening balance + transactions (always correct, slower)? I proposed derived + snapshots.
5. **Budgets.** Monthly only, or genuinely quarter/year periods too (the current UI has a switcher)?
6. **`created_by` / `modified_by` type.** Same question as (1) — UUID of the auth user, or INT of an internal user table?
7. **Historical data.** Do you want the schema seeded with the existing demo rows so the app looks populated immediately, or start empty?
8. **Hard delete.** Should anything ever be hard-deleted (e.g. import jobs, assistant messages), or is soft delete universal?
