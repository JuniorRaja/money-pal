# Audit: "one place" gaps in the statement-only journey

PRD: #6 (the app does not yet manage all of a user's accounts in one place). This document walks the
journey as the code runs today and lists every manual step that still interrupts it. Everything below
was read from the code or `docs/DECISIONS.md` on `claude/10-one-place-gaps`; nothing was run in a
browser. Settled rules are cited by their `docs/DECISIONS.md` heading (the headings are not numbered).
P7 is cited, not restated: see [`docs/plans/P7-zero-friction-onboarding.md`](plans/P7-zero-friction-onboarding.md).

## 1. Signup

- Route: `src/routes/login.tsx` (`mode === "signup"`, `handleSignUp` -> `supabase.auth.signUp`).
- Signup is invite-only: trigger `on_auth_user_check_allowlist` / `fn_check_email_allowlist()` in
  `supabase/migrations/20260817090000_remove_auto_confirm_add_allowlist.sql`. A new email must be
  inserted into `allowed_emails` by the operator first (service role only).
- After signup the user lands on `/`. The guard in `src/routes/__root.tsx` calls `getAccounts` and
  `onboardingRedirect` (`src/lib/onboarding.ts`), which sends any user with zero accounts to
  `/onboarding` from every route except `/login`.

## 2. Onboarding account

- Route: `src/routes/onboarding.tsx`, step `account`. Asks for a name and a type (Bank / Cash /
  Credit card). No opening-balance field.
- **No account row exists yet.** It is created later, at staging, in `confirmStage` in
  `src/components/import/import-wizard.tsx` (`createAccount`). The type is overridden by the detected
  preset (`hdfc_cc` -> credit card; `hdfc_savings` / `dbs` -> bank). The opening balance is inferred by
  `inferOpeningBalance` in `src/lib/import/stage.ts` from the first row that has a balance column,
  and is `0` when the statement has none.

## 3. Statement upload

- Route: `src/routes/onboarding.tsx`, step `upload`, rendering `ImportWizard` with
  `onboardingAccount` set (`accounts`, `sources`, `profiles` are passed empty).
- Flow, file first (DECISIONS "Import — wizard is file-first, not account-first"): file
  (`parse.ts`, `pdf.ts` for PDFs, password prompt client-side) -> column mapping only if the mapping
  does not validate (`mapping-editor.tsx`, presets in `src/lib/import/presets.ts`) -> a confirm step
  (`StatementConfirmStep`) -> `attachHashesToRows` (`hash.ts`) -> `stageImport`.
- `stageImport` also creates the `import_sources` row and the `import_profiles` mapping
  (`ensureImportSourceAndProfile` in `src/lib/mutations.functions.ts`), so "Sync now" exists
  afterwards.

## 4. Teach

- Route: `src/routes/onboarding.tsx`, step `teach`, rendering `TeachScreen`
  (`src/components/onboarding/teach-screen.tsx`).
- Grouping comes from `buildTeachGroups` (`src/lib/import/teach.ts`), which uses `heuristics.ts` /
  `keywords.ts`, `detectRecurring` and `propagateRecurringCategories` (`recurrence.ts`) and
  `group.ts`. Unresolved groups may get AI suggestions from `src/lib/categorize.functions.ts`
  (DECISIONS "Import — AI categorization is optional and progressive").
- Group picks are held in component state and mirrored into `localStorage` (see "First-run limits").

## 5. Commit

- `commitStatement` in `src/routes/onboarding.tsx` -> `bulkCommitImportRows` (`src/data/mutations`) ->
  `bulkCommitImportRowsFn` in `src/lib/mutations.functions.ts` -> RPC `fn_bulk_commit_import_rows` ->
  `fn_commit_import_row`, which tags each row with the account's `is_default` slice (latest definition:
  `supabase/migrations/20260820100000_category_centric.sql`).
- Settled groups commit with their suggested category; untouched groups commit uncategorised; one
  `import_rules` row is written per categorised group, **scoped to the onboarding account**
  (`account_id: progress.accountId`).
- Finishing removes the `localStorage` key and navigates to `/`.

## 6. Adding a second account

- Outside onboarding, the user is on the normal shell. Two routes to a second account:
  1. `AddRecordDialog` with `kind: "account"` (`src/components/add-record-dialog.tsx`, opened from
     `src/components/app-shell.tsx`). The opening balance is **typed by hand** here, unlike step 2.
  2. The import hub `src/routes/imports/index.tsx` -> `ImportFlowDialog`
     (`src/components/import/pipeline-modal.tsx`) -> `ImportWizard`. The wizard can only pick an
     existing account. With none importable it shows "Add an account first" and links to `/accounts`.
- Account choice is `suggestImportAccounts` in `src/lib/import/match-accounts.ts`: it matches bank
  names from the preset, filename and headers against `name + institution`, and **falls back to every
  importable account when nothing matches**. `ImportWizard` stages without asking when that list has
  exactly one entry, so a second bank's statement dropped while only one account exists is staged into
  that account. (Read from code; not reproduced.)
- The review step here is `TeachScreen` again (via `pipeline-modal.tsx`, or the full-page
  `src/routes/imports/$jobId.tsx`). These two commit paths write rules with `account_id: null`
  (global), unlike onboarding.

## 7. Next month's statement

- Hub `src/routes/imports/index.tsx`: "Sync now" on a saved source opens `ImportWizard` with the saved
  `import_profiles` mapping (DECISIONS "Import — bank presets"). "Sync now" means importing another
  file; the user still obtains the file and drops it in.
- Exact re-imports skip by hash (DECISIONS "Import — hash dedupe"; `hash.ts`). Staging that yields
  nothing new finishes the dialog ("Nothing new to review", `handleStaged` in `pipeline-modal.tsx`).
- Otherwise the user goes through `TeachScreen` and an explicit commit. The "Done" copy in
  `onboarding.tsx` says next month "will mostly sort itself"; how much actually sorts is a P7 metric
  that is still blank in the plan's "Done" table.

## First-run limits and progress storage

`src/routes/onboarding.tsx` supports **one account and one statement (one import job) per first run**.
`OnboardingProgress` in `src/lib/onboarding.ts` has a single `accountId`, a single `jobId`, and a fixed
`account -> upload -> teach -> done` sequence (`STEPS`). Progress is stored in the browser, not the
database: `localStorage` key `money-mate.onboarding` (`ONBOARDING_STORAGE_KEY`), keyed by `userId`,
holding step, account name/kind/id, `jobId`, group assignments and `committed`. It is written by
`saveProgress`, read by `readOnboardingProgress`, and removed by `finish()`. Staged rows are in the
database (`import_job_rows`), but the teach picks and the user's place in the flow are lost on another
browser/device or after clearing site data. Once any account exists the redirect stops forcing
`/onboarding`, and `/onboarding` without saved progress redirects to `/`.

## Manual interventions still required each month

| # | Intervention | Why it is manual |
|---|---|---|
| 1 | Download the statement and drop it in each month, per account | Gmail is "a coming-soon tile, not a live source" (DECISIONS "Import — hub, wizard, card review"); "Sync now" re-imports a file, it does not fetch one. |
| 2 | Transfers between the user's own accounts arrive as income on one side and expense on the other | DECISIONS "Import — no transfer matching": imported rows are income or expense only. `src/lib/import/heuristics.ts` says it "does not attempt transfer pairing"; `MappedImportRow.type` excludes `"transfer"` (`src/lib/import/types.ts`). |
| 3 | Convert each such expense to a transfer by editing it, one transaction at a time | DECISIONS "CC / EMI — expense → transfer via edit" (Decision #22 "stands; this is a post-import manual step"). Edit form: `src/routes/transactions.tsx`, type select + "To account", saved via `updateTransaction`. The same applies to paying a credit card: `v_credit_card_cycles.amount_paid` counts only positive **transfer** entries into the card (DECISIONS "CC — amount_paid is derived"), so an imported card payment recorded as income does not show against the cycle. |
| 4 | Near-duplicate clicks | DECISIONS "Import — near-duplicates are flagged, never auto-skipped". `attachNearDuplicates` (`src/data/live.ts`, matcher `src/lib/import/near-duplicate.ts`) flags on same account + signed amount + +-1 IST day. The hub list (`src/routes/imports/index.tsx`) shows "Possible duplicate" badges, but `teach-screen.tsx`, `teach.ts` and `group.ts` never read `possible_duplicate`, and `ReviewDeck` (`review-deck.tsx`, the Skip-first card) has no importer in `src/` (only `e2e/*.spec.ts` mention it). So in today's teach path a flagged row is committed with its group unless the user finds it elsewhere first. |
| 5 | Custom column mapping for any bank that is not HDFC savings, HDFC credit card or DBS | DECISIONS "Import — bank presets" (others use `custom`); `BANK_PRESETS` in `presets.ts`. PDFs: only HDFC savings has a tuned layout (DECISIONS "Import — PDF statements"). |
| 6 | Re-enter the mapping when a second unrecognised bank feeds one account | DECISIONS "Import — one custom mapping per account": `import_profiles` unique on `(user_id, account_id, bank_preset)`, so the second `custom` mapping overwrites the first. Accepted limitation there. |
| 7 | Re-tag slices | Commit applies only the account's `is_default` slice (`fn_commit_import_row`; DECISIONS "Import — categorisation and default slice"). No slice choice exists in the import UI. Moving a row to another slice is the single-transaction edit form ("Slice" / "To slice" in `src/routes/transactions.tsx`, `label_id` through `updateTransaction`). |
| 8 | Re-teach merchants on every new account | Onboarding writes account-scoped rules (`account_id: progress.accountId`), so a second account does not inherit them; `applyImportRules` resolves account-scoped before global (DECISIONS "Import — a learned rule is visible and declinable"). |
| 9 | Review and commit each job | `TeachScreen` ends in an explicit commit (`onImportAnyway` in `pipeline-modal.tsx`, `$jobId.tsx`); nothing auto-commits a fully settled job. |
| 10 | Create the second account and type its opening balance | See step 6; `AddRecordDialog` takes a typed balance, the onboarding path infers it. |

## Double-count risk from un-detected transfers

Every un-paired transfer of X paise between two imported accounts is recorded as an expense of X on
the sending account and income of X on the receiving one, so income and expense are each overstated
by X (net is unchanged). Affected: **category spend** (`v_category_spend`, filtered to
`type = 'expense'` only, read by `getCategorySpend` -> `liveCategorySpend` in
`src/data/repository.ts`); **budget `spent`** (`v_budget_progress` joins `v_category_spend`; read by
`getBudgets` -> `liveBudgets`); **reports and dashboard cashflow** (`v_monthly_cashflow`, which
excludes only `type = 'transfer'`, read by `getMonthlyRollups` -> `liveMonthlyRollups`; and
`summariseCashflow` over `listTransactions`). Balances and net worth are **not** affected: they derive
from ledger entries, which are correct on both accounts. The code gives no way to size this in rupees;
it grows linearly with own-account transfer volume (card payments, EMIs, sweeps, self-transfers), and
a rows keyword-tagged "Transfer" (`keywords.ts`) still counts in `v_category_spend` because the view
filters on type, not category.

## Prioritised gaps

1. Own-account transfers are not recognised, so spend, budgets and reports are inflated: reversing
   DECISIONS "Import — no transfer matching" is a product call. `decision needed from PR`
2. Even inside that rule, no assisted path: no pair suggestion (same amount, +-1 day, opposite sign,
   different own accounts) and no bulk expense -> transfer conversion in the teach step. `spec needed`
3. Near-duplicate flags are invisible in the current teach path; `ReviewDeck` is orphaned. Decide
   where the flag surfaces and what "Skip" means for a group. `spec needed`
4. Second account is a detour: separate creation with typed opening balance, and the single-account
   fallback in `suggestImportAccounts` can stage a different bank's file into the only account.
   `spec needed`
5. Statements still have to be fetched by hand each month; inbound mail/Gmail is deferred in
   DECISIONS. `decision needed from PR`
6. Unlisted banks need column mapping, and one `custom` mapping per account is overwritten by a
   second. Header-signature key is planned.
   `already planned (docs/plans/P1-3-merchant-and-mapping-memory.md)`
7. Only HDFC savings, HDFC credit card and DBS have presets; PDF layout is tuned for HDFC savings
   only. Each new bank needs a fixture-backed preset. `spec needed`
8. Slice re-tagging is per-transaction after commit; no slice choice or bulk re-tag at import.
   `spec needed`
9. Rules taught in onboarding are scoped to account 1, so each new account starts cold. `spec needed`
10. "Next month will mostly sort itself" is unmeasured: P7's Done metrics (auto-categorised share,
    groups needing input, taps) are blank. `already planned (docs/plans/P7-zero-friction-onboarding.md)`
