---
name: Budgets feature
overview: "Make monthly category budgets a real CRUD feature: planned amounts live in `budgets` / `budget_lines`, spent stays derived from the ledger, with month navigation, pacing alerts, the 50/30/20 template, copy-last-month, and an explicit no-rollover decision."
todos:
  - id: schema-view
    content: Add budget_line_id and budget_id to v_budget_progress; pull migration; regenerate types
    status: completed
  - id: mutations
    content: Fix create upsert; add update/archive line, apply template, copy previous month
    status: completed
  - id: budgets-ui
    content: Month picker, CRUD, pacing/over-budget, template + copy, unbudgeted spend, empty state
    status: completed
  - id: decisions
    content: "Write docs/DECISIONS.md: no rollover and related budget rules"
    status: completed
  - id: todo-1786633685592-d3abv5rqc
    content: Prepare a test plan for the budgets using playwright MCP
    status: cancelled
  - id: todo-1786633723455-y9gm57c5q
    content: Run the test using the MCP and produce a result.
    status: cancelled
isProject: false
---

# Budgets feature

## Schema fit (verified on live `money-pal`)

The current schema **already matches PRD Phase 5** on the important rule: **planned is stored; spent is never stored**.

```mermaid
flowchart LR
  budgets["budgets\nuser + month + currency"]
  lines["budget_lines\ncategory + planned"]
  spend["v_category_spend\nexpense txns that month"]
  progress["v_budget_progress"]
  budgets --> lines
  lines --> progress
  spend --> progress
```

- [`budgets`](supabase/migrations/20260811150200_planning_workshop.sql): one row per user per `period_month` (first of month). Unique `(user_id, period_month)` where not deleted.
- [`budget_lines`](supabase/migrations/20260811150200_planning_workshop.sql): `planned` (paise, `>= 0`). Unique `(budget_id, category_id)` where not deleted.
- [`v_budget_progress`](supabase/migrations/20260811150300_views.sql): `spent` from [`v_category_spend`](supabase/migrations/20260811150300_views.sql) (`transactions.type = 'expense'` grouped by header `category_id` + month). `remaining` and `used_bps` are computed.
- Seeded template **Balanced 50/30/20** (10 lines, 10000 bps) plus RPC [`fn_apply_budget_template`](supabase/migrations/20260811150200_planning_workshop.sql).

**PRD vs this app (do not revert the ledger):** [docs/PRD.md](docs/PRD.md) describes category-side ledger entries. Money Pal stores `category_id` on `transactions` and account amounts on `transaction_entries`. Budget progress already follows the live model. That is the source of truth.

**Rollover (confirmed):** none. Leftover or overspend does not change next month’s `planned`. Document in new [docs/DECISIONS.md](docs/DECISIONS.md). Each month is a new header + lines (copy/template are explicit user actions, not automatic carry).

**Gaps (schema / API, small):**

1. `v_budget_progress` has no `budget_line_id` / `budget_id`. The UI fakes `id` as `` `${period}-${category_id}` `` in [src/data/live.ts](src/data/live.ts), so edit/delete cannot target a row.
2. [createBudgetFn](src/lib/mutations.functions.ts) uses PostgREST `onConflict: "budget_id,category_id"`. Live unique index is **partial** (`WHERE deleted_at IS NULL`), so that upsert is not a valid `ON CONFLICT` target. Replace with select-then-update/insert (same pattern as the parent `budgets` row). Do not add a non-partial unique constraint (it would block re-adding a soft-deleted line).
3. `fn_apply_budget_template` uses `ON CONFLICT DO NOTHING` with no target, which is fine for unique violations. It **does not update** existing lines. Keep that: template fills missing categories only.
4. Create currently hardcodes `currency_code: "INR"` instead of the profile base currency (the RPC already does this correctly).

No new tables. One view change + app mutations.

## Product behaviour this pass

Match Accounts-style management on [src/routes/budgets.tsx](src/routes/budgets.tsx):

- **Month picker** (prev/next + current). Loader uses that period, not hardcoded “August 2026”. Prefer local calendar month for `YYYY-MM` (today `CURRENT_PERIOD` uses UTC `toISOString()`, which can be the wrong month in IST).
- **Add line:** wire page **New budget** to the existing budget form in [src/components/add-record-dialog.tsx](src/components/add-record-dialog.tsx). Restrict the category list to `essentials` / `lifestyle` / `investment` (exclude `income` and `transfer`). Duplicate category in the same month updates `planned` (upsert-by-select).
- **Edit planned** / **remove line** (soft-delete `budget_lines.deleted_at`). Confirm on remove. Spent is unchanged because it is not stored.
- **Pacing alerts (PRD):** over 100% is destructive. Before month-end, flag categories **ahead of calendar pace** (`spent/planned` vs `dayOfMonth/daysInMonth`). Drop fake “24 days left”.
- **Apply Balanced 50/30/20:** dialog asks for monthly income (rupees → paise), calls existing RPC for the visible month. Existing lines stay; missing categories get planned amounts.
- **Copy last month:** copy previous month’s non-deleted lines into the visible month (get-or-create header). Skip categories that already have a line. If there is no previous budget, toast and no-op.
- **Empty state** when the month has no lines.
- **Unbudgeted spend:** list expense categories with spend this month and no budget line (query `v_category_spend` for the period, subtract budgeted ids). Makes overspend obvious when the user never planned that category.

Overview ([src/routes/index.tsx](src/routes/index.tsx)) already sums `v_budget_progress` for the current month; it should pick up real data once lines exist. Only replace hardcoded copy if it still lies about the month.

## Implementation

**View** — recreate `v_budget_progress` with `bl.id as budget_line_id`, `b.id as budget_id` (keep `security_invoker = true`). Iterate on the remote DB, then `supabase db pull` a migration per the Supabase skill. Refresh [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts).

**Domain** — [src/data/schema.ts](src/data/schema.ts) `BudgetPeriod`: real `id` (line id), optional `budget_id`, keep `spent` derived in the client from the view.

**Mutations** in [src/lib/mutations.functions.ts](src/lib/mutations.functions.ts) + [src/data/mutations.ts](src/data/mutations.ts):

- Fix `createBudgetFn` (no broken upsert; currency from `profiles.base_currency`).
- `updateBudgetLineFn` (planned only).
- `archiveBudgetLineFn` (soft delete).
- `applyBudgetTemplateFn` → `fn_apply_budget_template('Balanced 50/30/20', ...)`.
- `copyBudgetFromPreviousFn` (read previous `period_month` lines, insert into current).

**UI** — budgets page: month nav, wired create, row actions, template + copy actions, real remaining/pace copy, empty + unbudgeted sections. Small edit dialog (planned amount) rather than overloading add-record unless it stays simple.

**Decision log** — [docs/DECISIONS.md](docs/DECISIONS.md): no rollover; spent always from ledger; template does not overwrite; copy-last-month skips existing categories.

## Out of scope

Quarter/year switcher from the old Lovable mock, custom template editor, income budgets, changing how `v_category_spend` treats transfers/investments.
