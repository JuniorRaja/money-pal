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

Keep Connected sources, activity, and Needs your eye. Review is Tinder-style cards. A job can be paused and resumed (commit part of the file, come back later). Gmail is a coming-soon tile, not a live source. No Gmail OAuth in this pass. PDF is live (see "Import — PDF statements" below).

## Import — wizard is file-first, not account-first

Supersedes the earlier "account required, optional preset, then file" order. The wizard is **file → columns → account**: drop the statement, we detect the bank and map columns, and the account step appears only when the match is ambiguous. When exactly one importable account matches the detected bank, staging happens without asking. The account is still required before anything is written — it is inferred rather than demanded up front, because the statement usually identifies it.

The import flow lives in a dialog opened from the hub (`ImportFlowDialog`). There is no standalone `/imports/new` route.

## Import — amount and date parsing

Leading and trailing currency tokens (`₹`, `Rs`, `Rs.`, `INR`) are stripped from an amount cell before parsing; parentheses and `Dr`/`Cr` suffixes set direction. A cell that still will not parse means the row is skipped and counted in `skippedRowCount` — never silently zeroed or scaled.

Ambiguous numeric dates default to **DMY** (Indian statements). `MDY` is inferred when the first component cannot be a day. The mapping editor offers Auto / DMY / MDY only: ISO dates are recognised before any hint is consulted, so a `YMD` choice could only break a `dd/mm` file.

## Import — everything is IST

Staged and committed rows use midnight Asia/Kolkata (`midnightIst`). Postgres returns that as `…T18:30:00+00:00`, so a calendar day is **always** derived with `dayKey()` from `lib/money.ts`, never by slicing the first ten characters of a timestamp. Slicing loses a day for every row.

## Import — PDF statements

`pdf.js` text-layer extraction feeds the same pipeline CSV/Excel uses (`parseFileToGrid` → `parseImportGrid`), so amount/date parsing and dedupe are shared and untested paths don't multiply. Parsing stays in the browser; the PDF is never uploaded. A password-protected PDF prompts for the password client-side and it is never sent anywhere. A PDF with no extractable text layer (scanned) is rejected with a clear error — no OCR. Only HDFC savings has a tuned layout so far; a new bank needs its own fixture, not a shared guess.

## Import — Excel parsing comes from the SheetJS CDN

`xlsx` is pinned to `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, not the npm registry. The newest npm build is 0.18.5 and carries unpatched prototype-pollution and ReDoS advisories; SheetJS ships fixes only from their own CDN. Do not "upgrade" this back to a registry version. No `bunfig.toml` exclusion applies — `minimumReleaseAgeExcludes` entries are package names, and an `xlsx` entry would whitelist the registry build being avoided.

## Import — one custom mapping per account

`import_profiles` is unique on `(user_id, account_id, bank_preset)`, and every unrecognised bank maps to the `custom` preset. So a second custom-mapped bank on the same account overwrites the first one's saved mapping. Known limitation, accepted: fixing it needs a header-signature column in the profile key. Revisit if anyone actually runs two unrecognised banks into one account.

## Import — categorisation and default slice

Light merchant heuristics plus review. Accepting a correction writes an `import_rules` row (normalized merchant contains → category; optional account, else global). Staged rows may carry `suggested_category_id`. On commit, the account’s `is_default` label (PRD “Unassigned”) is applied as the slice.

## Import — a learned rule is visible and declinable

Writing the rule stays the default, but it is no longer an invisible side effect: correcting a category shows a checked "Also remember this for X" box on the review card, and clearing it accepts the row without teaching anything. A row that was categorised by a rule says so ("From your rule"). Rules are listed and edited in **Settings → Import rules**, grouped account-scoped first then global — the order `applyImportRules` resolves them in. A rule is paused with `is_active` (kept, stops applying) or removed with `deleted_at`; nothing is hard-deleted. Correcting a merchant an account-scoped rule already covers updates **that** rule rather than adding a narrower one that could never win against it; a broader global rule is left alone and an account-scoped rule is added instead, so fixing one account never silently re-teaches the others. Re-teaching a merchant reactivates its paused rule — `ux_import_rule_match` allows no second row, so leaving it paused would silently do nothing.

## Import — a job can be dismissed

Every staged job used to be permanent: the only way to clear a panel was to resolve every row.
`dismissImportJob` soft-deletes the job **and** its unresolved (`pending` / `held`) rows — rows
first, so a dismissed job cannot leave orphans in the review queue. Rows already `imported` and the
transactions they wrote are untouched; re-importing the same file re-stages only what was never
committed, because the hashes of the committed rows still dedupe. Deliberately a plain RLS update
rather than an RPC: no counter arithmetic is involved.

"Waiting for you" fetches at most 200 rows and renders 8, with a "Show N more". The queue is a
to-do list, not an archive of everything ever staged.

## Import — a file that is not a statement is rejected at the door

Fewer than three columns cannot satisfy date + description + amount, so the mapping editor would
present three permanently-unsatisfiable errors. The wizard says so on the file step instead and
lets the user drop a different file.

## Import — a reference number is not a merchant

`extractMerchant` drops tokens containing five or more digits and tokens that are only digits,
`#`, or `*`, then strips payment-rail prefixes (`UPI`, `NEFT`, `IMPS`, `RTGS`, `P2P`, …) until none
remains. When nothing is left it returns `""` — `applyHeuristics` then falls to confidence 0.2 and
shows the raw narration, which sends the row to review honestly rather than presenting
"P2p 622157719873#09" as a merchant name.

## CC — amount_paid is derived

`credit_card_cycles.amount_paid` is not stored. `v_credit_card_cycles` (and `v_credit_card_current`) derive it as the sum of positive transfer entries into the CC account that occurred after the previous cycle's `statement_date` and on or before this cycle's `statement_date`. Paying the card as a normal transfer automatically reflects on the cycle; no manual entry.

## CC / EMI — expense → transfer via edit

An imported expense can be converted to a transfer (e.g. into a loan account for an EMI) by opening Edit on the transaction in the side panel and switching type to Transfer. Decision #22 ("no transfer auto-detection on import") stands; this is a post-import manual step.

## Import — no transfer matching

Imported rows are income or expense only. Transfers are not auto-detected. The user can edit the transaction later.

## Import — hash dedupe

Hash is `sha256(account_id | date | signed_amount | normalized_narration | n)` where `n` is the 0-based index among rows that share the same date + amount + narration **in this file**. Re-importing the same mapped file skips those hashes (`skipped_duplicate`). Two genuine identical charges in one statement get `n=0` and `n=1`. Unique `ux_txn_external` on `transactions(user_id, external_ref)` stores the hash as `external_ref`. `fn_record_transaction` accepts `p_source` (CSV uses `csv`; manual stays `manual`), `p_external_ref`, and `p_confidence`.

## Import — near-duplicates are flagged, never auto-skipped

The hash above only catches a byte-identical narration. The same statement re-exported by another tool writes `UPI-SWIGGY-9876@ybl` where the first wrote `UPI/SWIGGY/9876`, so the hash misses it. **The hash formula does not change** — `ux_txn_external` stores it, and changing it invalidates every `external_ref` already committed.

Instead the queue reads match on the fields that do not drift: same `account_id`, same signed amount, `occurred_at` within **±1 IST day** (banks routinely differ by one between transaction date and value date for the same entry). A match sets `possible_duplicate` on the staged row.

A near-duplicate is **flagged for review, never auto-skipped**. Two genuine ₹200 Swiggy orders on one day are indistinguishable from a duplicate by amount and date alone; a false flag costs one click, a missed duplicate corrupts the ledger. The review deck leads with **Skip** and demotes accept to _Import anyway_; Skip goes through the existing `fn_set_import_row_status` state machine as `skipped` — no new status.

`possible_duplicate` is **computed on every read, never stored** (`attachNearDuplicates` in `data/live.ts`, matcher in `lib/import/near-duplicate.ts`). A flag persisted at stage time goes stale the moment the matched transaction is edited or deleted, and this needs no column and no migration. Only `pending`/`held` rows are matched — a committed row would match the transaction it created.

## Import — review queue kinds

A staged row reaches "Needs your eye" as exactly one of `pending`, `held`, or `low_confidence` (confidence below `IMPORT_LOW_CONFIDENCE_MAX`, 0.8 — the single threshold; there is no second one). The `review_kind` Postgres enum (`duplicate` / `unknown_merchant` / `large_transfer`) belongs to the superseded `import_review_items` table and is not read by any code path.

Row status transitions between `pending` / `skipped` / `held` go through `fn_set_import_row_status`, which owns the `import_jobs.rows_done` counter in the same locked statement. Only `skipped` counts a row as done; `held` leaves it open, so a job holding rows never reports finished. `imported` and `skipped_duplicate` are terminal.

## Import — live model vs PRD

Category lives on `transactions`. Staging is `import_job_rows`, not uploaded files. Hub tables `import_sources` / `import_jobs` / `import_review_items` remain; profiles, staged rows, and rules are additive. Do not rewrite PRD history.

## Investments — holdings do not enter net worth

Overview's `investments` figure is the ledger balance of `investment` accounts (`summariseNetWorth`
in `data/repository.ts`), and it stays that way. Buying a fund is a transfer from bank into the
investment account, so the **principal is already counted there**. Adding `v_holdings_valuation`'s
`current_value` on top would count every rupee invested twice.

If market value is ever wanted on Overview, the only correct addition is the **unrealised gain**
(`current_value - invested`), never `current_value`. Market prices affect the Investments page only.

## Investments — a stale price is never a zero

`holdings.last_price` (paise) is written by the daily price task, and a hand-entered value goes into
the same column — there is no separate "manual" field and no fallback chain. When a feed fails, is
rate-limited, or returns a shape the parser does not recognise, the row is **left exactly as it
was**: old price, old `priced_at`. Nothing writes a zero, and nothing throws away the batch because
one symbol died.

A zeroed holding silently understates the portfolio and looks like a real number. An old price with
its date beside it is visibly old, so the UI always renders `priced_at` next to the value and flags
it past 3 days for fed holdings, 180 for hand-valued ones.

## Investments — day change needs two price dates

`holdings.prev_price` holds the previous close. `v_holdings_valuation.day_change_pct` is `0` while
`prev_price` is `0`, which means **"not known yet"**, not "flat" — the UI shows an em dash, not
`0.0%`. The price task only rolls `last_price` into `prev_price` when the stored `priced_at` is from
an earlier day, so re-running it twice in one day cannot flatten the day change to zero.

There is no price history table. Only yesterday is kept, which is all a day change needs; the
Portfolio-trend sparkline is still mock data and is what would justify real history.
