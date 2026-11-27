# Spec: getting slice assignment out of a statement

**Nothing is implemented by this ticket (#9, PRD #6).** This is a spec only: no code, no migration,
no test changes. It records how imported transactions get their slice today, lists the ways a user
can set a slice today, and compares options for letting a statement (or the user, during import)
choose a slice. PR picks the option; a later ticket builds it.

Citations are `file:line` against `main` at the time of writing. `docs/DECISIONS.md` wins over code
where they disagree ("Import — categorisation and default slice", lines 81-83).

## 1. Today's behaviour

### 1.1 Commit always writes the account's default slice

- `fn_commit_import_row` (`supabase/migrations/20260820100000_category_centric.sql:340`, latest
  definition; `fn_bulk_commit_import_rows` in `20261108130000_bulk_import_uncategorized.sql:1`
  calls it at line 60) selects the slice with
  `where user_id = v_uid and account_id = v_row.account_id and is_default and deleted_at is null`
  (lines 408-414) and passes it as `p_from_label` to `fn_record_transaction` (line 426).
- DECISIONS "Import — categorisation and default slice" (`docs/DECISIONS.md:81-83`): "On commit,
  the account's `is_default` label (PRD "Unassigned") is applied as the slice."
- The default slice of a bank or cash account is created by `trg_account_default_slice`
  (`20260811150100_core_money.sql:173-191`), named **`Mine`**, kind `owned`, with the account's
  opening balance. The old PRD called it `Unassigned`; the live name is `Mine`. At most one default
  per account (`labels_slice_default_uq`, `core_money.sql:116-118`).
- Accounts that cannot hold slices (`credit_card`, `investment`, `loan`; `fn_slice_guard`,
  `core_money.sql:144-145`, allows bank and cash only) have no default, so `v_label` is null and the
  entry is written with no slice. The UI shows that as "Unallocated"
  (`src/routes/transactions.tsx:504-512`).
- Staged rows carry no slice. `import_job_rows` has no label column
  (`20260814080138_csv_import_center.sql`, table at line 80; later migrations only rename
  `merchant` and add `narration`/`note`), and `ImportJobRow` (`src/data/schema.ts:288`) has none.
  `toStageDrafts` (`src/lib/import/stage.ts:115-150`) emits no slice field.

### 1.2 `import_rules` has no slice column

- `ImportRule` (`src/data/schema.ts:312-320`) is `id, pattern, match_field, category_id,
  account_id, is_active`. The table (`20260814080138_csv_import_center.sql:112-123`, with
  `match` renamed to `pattern` and `match_field` added at `20260820100000_category_centric.sql:25-31`)
  has no `label_id`.
- `applyImportRules` (`src/lib/import/stage.ts:86-92`) returns only `category_id`.
  `findImportRule` (`stage.ts:65-84`) resolves account-scoped rules before global ones
  (`account_id is null`).

### 1.3 Slice kinds and net worth

| `SliceKind` | Meaning | In net worth? |
| --- | --- | --- |
| `owned` | genuinely yours | yes |
| `custodial` | someone else's money you hold | **no** |
| `earmark` | yours but committed | yes |

Sources: `src/data/schema.ts:95-100` (type comment) and `docs/PRODUCT.md` ("Net worth counts only
what is owned, excluding custodial funds"; Accounts row: "slices (owned/custodial/earmark)").
`PRODUCT.md` does not state earmark explicitly; the schema comment and the view do:
`v_net_worth_owned` (`20260811150300_views.sql:225-233`) is `sum(balance) - sum(custodial_amount)`,
and `summariseOwnership` (`src/data/repository.ts:183-192`) matches. Earmarks are never subtracted.

Consequence: because imports land in `Mine` (owned), a deposit that is really someone else's money
is counted in net worth until the user moves it by hand.

### 1.4 Every place a user can set a slice today

| Path | Where | What it does |
| --- | --- | --- |
| Account slice management | `src/components/manage-slices-dialog.tsx` (opened from `src/routes/accounts.tsx:355`); server `createSliceFn`, `updateSliceFn`, `archiveSliceFn` in `src/lib/mutations.functions.ts:416`, `550`, `479` | Create, rename, change kind, set opening amount, archive. Creating carves the amount out of the default slice's `opening_amount` (`mutations.functions.ts:458-466`). Does not touch any transaction. |
| New transaction | `AddRecordDialog` slice chips (`src/components/add-record-dialog.tsx:890-940`) -> `createTransactionFn` (`mutations.functions.ts:79`, `label_id` at line 74) | Picks one slice per side. |
| Edit a transaction | `DetailPanel` "Change Slice" (`src/routes/transactions.tsx:542`, handler at 431-445) and `EditTransactionDialog` (`transactions.tsx:665`, select at 874-886) -> `updateTransaction` -> `p_from_label` / `p_clear_from_label` (`mutations.functions.ts:190-193`) | Reassigns one transaction to one slice, or clears it. |
| Split across slices | **Not found.** `PRODUCT.md` lists "split across slices", but `createTransactionFn` and `fn_record_transaction` take a single `p_from_label` / `p_to_label` (`category_centric.sql:102-103`), so a transaction has one slice per account side. The only "split" in the UI is splitting an account balance into slices (`manage-slices-dialog.tsx:169`). | n/a |

**None of these is part of the import or onboarding flow.** `src/routes/onboarding.tsx` has no
slice reference (account step at line 273, upload step at 329, then commit via `bulkCommitImportRows`,
line 14); `src/lib/import/stage.ts` has none (1.1); the review deck cannot set one. The only way
to get an imported row into a non-default slice is to commit it, then open the transaction and
change the slice by hand.

### 1.5 Invariants and allocation as they exist

- **PRD I1/I2.** `docs/PRD.md` is no longer in the tree (removed in `a68bef2`; `CLAUDE.md` still
  points at it). The text is in `git show a68bef2^:docs/PRD.md`, lines 102-113: **I1** entries
  balance (sum is zero per transaction); **I2** labels cannot drift (every account-side entry has a
  slice, so the slices of an account sum to its balance).
- **Live I2 is weaker than the PRD.** `transaction_entries.label_id` is nullable
  (`core_money.sql:301`) and the guard returns early on null (`core_money.sql:349-351`).
  Drift is tolerated and surfaced: `unallocated = balance - allocated`
  (`v_account_allocation`, `views.sql:208`). Unlabelled entries, or opening amounts that do not
  sum to the balance, show up there.
- **Slice must belong to the entry's account.** Enforced twice: `fn_assert_slice_on_account`
  (`core_money.sql:419`, called from `fn_record_transaction` at `category_centric.sql:139,144`)
  raises `slice not found` or `slice does not belong to account`, and the entry trigger
  (`core_money.sql:349-370`) raises on a mismatch or an archived slice.
- Changing a slice never changes the account balance. It moves money between slice amounts, so
  `allocated` is unchanged when both slices are on the same account.

## 2. Options

All three keep the account-match guard above as the backstop. Without a fallback, a bad slice raises
inside `fn_commit_import_row`; only `unique_violation` is caught there
(`category_centric.sql:435-459`), so the error aborts the whole `fn_bulk_commit_import_rows` call and
the batch rolls back.

### Option A: slice on the import rule

- **Schema.** `import_rules.label_id uuid references labels(id)` (nullable);
  `import_job_rows.suggested_label_id uuid references labels(id)` (nullable);
  `fn_commit_import_row` uses `coalesce(suggested_label_id, default)`. Client: `ImportRule`,
  `toStageDrafts`, `applyImportRules` return a slice too; Settings -> Import rules
  (`src/routes/settings.tsx:247`) gets a slice column.
- **Allocated / unallocated.** Allocated is unchanged for the account (money moves between slices
  of the same account). Unallocated is unchanged; `Mine` shrinks and the target slice grows, so
  net worth falls only when the target is `custodial`.
- **I1/I2.** I1 untouched (no entry shape change). I2 holds: `label_id` is still set and still on
  the entry's account, subject to the guard.
- **Wrong-account failure.** A rule is account-scoped (`account_id` set) or global
  (`account_id` null, `stage.ts:71-72`). A global rule cannot name one slice, since slices belong to
  one account (`labels.account_id`); the same rule on a second account points at a slice that
  account does not own. An account-scoped rule whose slice is later archived has the same
  problem. Result: `slice does not belong to account` or `slice not found` at commit, batch
  rolled back, user stuck on a commit that always fails. Required guards: (1) a rule may carry
  `label_id` only when `account_id` is set and equals `labels.account_id`, as a check at write time;
  (2) at commit, if the slice is missing, archived, or on another account, fall back to the default
  slice and flag the row rather than raising. Also decide what happens to a rule when its slice is
  archived (clear `label_id`).
- **Pros / cons.** Teaches once, applies every statement; fits the existing rules model and the
  "Also remember this" box (DECISIONS lines 85-87). Cons: pattern-to-slice is a weaker signal than
  pattern-to-category (one payee can be both personal and held-for-Mom); the hazard above is real.

### Option B: slice picker in the review deck (per row)

- **Schema.** `import_job_rows.suggested_label_id` (needed so a paused job keeps the choice; rows
  persist, DECISIONS line 43); `fn_commit_import_row` as in A. A new `p_rows` key is optional.
  No change to `import_rules`.
- **Allocated / unallocated.** As A, per row.
- **I1/I2.** As A.
- **Wrong-account failure.** Low. The picker only lists slices of the row's `account_id` (the
  pattern `AddRecordDialog` already uses, `add-record-dialog.tsx:609-611`). It can still go stale
  if the slice is archived between staging and commit; same commit fallback as A.
- **Pros / cons.** Explicit, per-row, no hidden rule. Cons: nothing is learned, so a recurring
  custodial deposit needs the same tap every month; adds a control to a deck built for speed.

### Option C: per-statement default slice

- **Schema.** `import_job_rows.suggested_label_id` set for every row at staging from one pick (or
  `import_profiles.default_label_id` for a reusable per-account default, since `import_profiles` is
  keyed on account, `import_profiles` unique per user + account + preset, DECISIONS line 47).
  `import_jobs` has no `account_id` (`20260811150200_planning_workshop.sql:142-156`), so the pick
  must live on the rows or on the profile, not the job.
- **Allocated / unallocated.** As A, but in bulk: a whole statement moves to one slice.
- **I1/I2.** As A.
- **Wrong-account failure.** Moderate for a profile-level default (profile is per account, but the
  slice can be archived or the profile re-mapped to a different account). For a per-run pick the
  wizard already resolves the account first, so the list can be filtered the same way as B.
- **Pros / cons.** Fits an account that is entirely one purpose (a "Mom's money" account).
  Wrong for a mixed account, which is the product's main case (`PRODUCT.md`: HDFC split into
  Mom / personal / reserve).

## 3. Recommendation

**Option A, restricted to account-scoped rules, with Option B's per-row override as the follow-up.**
It matches the recurring case (a known payer or payee goes to one slice) and reuses the rules the
user already manages. The restriction (no slice on global rules) closes the main wrong-account path.

**Smallest first ticket (size M): the plumbing, no UI beyond Settings.**
1. Migration (new file, none edited): `import_rules.label_id`, `import_job_rows.suggested_label_id`,
   a trigger or check requiring `label_id is null or account_id is not null`, and a rule-write check
   with `fn_assert_slice_on_account`.
2. `fn_commit_import_row`: `coalesce(valid suggested slice, default slice)`, falling back to the
   default when the slice is archived or on the wrong account. Never raise.
3. `toStageDrafts` / `applyImportRules` return the slice; stage it on the row.
4. Settings -> Import rules: optional slice select, filtered to the rule's account.
5. Unit tests for the stage logic in `src/lib/import/`; the RPC fallback needs a SQL test, which
   this repo has no harness for (cloud runs have no Docker), so flag it for e2e.

Out of scope for ticket 1: the review-deck picker, onboarding wording, auto-creating slices.

## 4. Open questions for PR (answer before the first ticket)

1. **Which slices exist** on each account that you import into (names, and which account each
   lives on)? Rules can only point at slices that already exist.
2. **Which are custodial?** These change net worth the moment a rule moves money into them, so list
   them explicitly (for example Mom's money, trip money).
3. **How would you describe them at onboarding?** Onboarding creates accounts and imports
   (`onboarding.tsx:273-350`, commit call at `onboarding.tsx:206`) but never creates slices. Do you want a "Do you hold money for
   anyone?" step, or keep that in Accounts?
4. **Same payee, two slices?** If one payee can be both personal and held-for-someone, is a rule
   enough, or must it be per row (Option B first)?
5. **When a rule's slice is archived,** should the rule clear its slice, pause, or keep pointing and
   fall back at commit?
6. **Credit card, loan and investment accounts** have no slices (`core_money.sql:144-145`). Confirm
   that rules should be ignored there rather than allowing slices on those kinds.
7. **Existing imports:** do already-committed rows need a bulk re-slice, or only new statements?
8. **Doc drift:** `docs/PRD.md` is gone but `CLAUDE.md` and `DECISIONS.md` still cite it and its
   `Unassigned` label (live name `Mine`). Restore the I1/I2 text somewhere citable?
