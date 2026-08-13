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
