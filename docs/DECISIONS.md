# Decisions

Product rules that are settled. When code and this file disagree, this file wins until a new decision is recorded.

## Budgets — no rollover

Unused remainder and overspend do **not** change next month’s planned amounts. Each month is a new `budgets` header plus `budget_lines`. Copy-last-month and the 50/30/20 template are explicit user actions, not automatic carry.

## Budgets — spent is derived

`planned` is stored on `budget_lines`. `spent` is never stored. Progress comes from `v_budget_progress` / `v_category_spend` (expense transactions in that calendar month, by header `category_id`). Deleting or editing a transaction updates progress with no reconciliation step.

## Budgets — template does not overwrite

`fn_apply_budget_template` (`Balanced 50/30/20`) inserts missing category lines only. Existing planned amounts stay as the user set them.

## Budgets — copy last month skips existing categories

Copying last month into the visible month get-or-creates the header and inserts only categories that do not already have a live line. Soft-deleted lines do not block a new insert.

## Budgets — category source of truth

Category lives on `transactions`, not on ledger entries. Budget progress follows that live model. The older PRD entry-side category layout is not used.

## Goals — saved is stored contributions

Goal progress is `SUM(goal_contributions.amount)` via `v_goal_progress`. It is **not** an earmark slice balance. PRD Phase 6 (goal funded by an EARMARK label) is deferred. Earmark slices on Accounts keep their own target amount and date.

## Goals — optional transaction links

A contribution may point at a `transactions` header id. Linking does not move ledger money. Unlinking clears the pointer and leaves saved unchanged. Deleting a transaction sets `transaction_id` to null (`ON DELETE SET NULL`) and leaves saved. One live contribution per transaction.

## Goals — monthly plan is not an auto-transfer

`monthly_contribution` is used for ETA and pace only. Nothing is transferred automatically.

## Goals — archive leaves the ledger

Soft-deleting a goal hides it from progress. Contribution rows stay. Accounts, slices, and transactions are not changed.
