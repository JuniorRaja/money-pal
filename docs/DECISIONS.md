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

## Import — CSV/Excel in the browser

Phase 4 import is CSV and Excel (`.xlsx` / `.xls`) parsed **in the browser**. The original file is never uploaded or stored. Only parsed staging rows persist so a job can pause and resume.

## Import — bank presets

First-class presets: **HDFC savings**, **HDFC credit card**, **DBS**. Other Indian banks use the generic mapper (`custom`). A successful map is saved on `import_profiles` (unique per user + account + preset) and reused. **Sync now** means import another file with that mapping.

## Import — hub, wizard, card review

Keep Connected sources, Parsing activity, and Needs your eye. New import is a real wizard (account required, optional preset, then file). Review is Tinder-style cards. A job can be paused and resumed (commit part of the file, come back later). Gmail and PDF are coming-soon tiles, not live sources. No Gmail OAuth in this pass.

## Import — categorisation and default slice

Light merchant heuristics plus review. Accepting a correction writes an `import_rules` row (normalized merchant contains → category; optional account, else global). Staged rows may carry `suggested_category_id`. On commit, the account’s `is_default` label (PRD “Unassigned”) is applied as the slice.

## Import — no transfer matching

Imported rows are income or expense only. Transfers are not auto-detected. The user can edit the transaction later.

## Import — hash dedupe

Hash is `sha256(account_id | date | signed_amount | normalized_narration | n)` where `n` is the 0-based index among rows that share the same date + amount + narration **in this file**. Re-importing the same mapped file skips those hashes (`skipped_duplicate`). Two genuine identical charges in one statement get `n=0` and `n=1`. Unique `ux_txn_external` on `transactions(user_id, external_ref)` stores the hash as `external_ref`. `fn_record_transaction` accepts `p_source` (CSV uses `csv`; manual stays `manual`), `p_external_ref`, and `p_confidence`.

## Import — live model vs PRD

Category lives on `transactions`. Staging is `import_job_rows`, not uploaded files. Hub tables `import_sources` / `import_jobs` / `import_review_items` remain; profiles, staged rows, and rules are additive. Do not rewrite PRD history.
