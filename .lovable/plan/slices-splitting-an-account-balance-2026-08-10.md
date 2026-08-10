# Slices: splitting an account balance

Turn today's transaction labels into **slices** — named parts of a single account's balance, so ₹70,000 in one bank account reads as ₹50,000 Mine, ₹20,000 Mom's, and spending on Mom's train ticket pulls the Mom slice (and the account total) down.

## Kinds

Every slice carries a kind, because the money means different things:

- **Owned** — genuinely yours. Counts fully in net worth.
- **Custodial** — someone else's money you hold and owe back (Mom's ₹20,000). Excluded from net worth.
- **Earmark** — yours, but committed (emergency reserve, trip fund). Counts in net worth, can carry a target date and target amount.

Slices belong to one account each. A "Mom" slice in the bank account and a "Mom" slice in cash are separate slices. Credit cards and loans stay out of scope for now — slices apply to bank, cash and investment accounts.

## How many slices

- Every eligible account always has **at least one slice**. When an account is created (or when this feature ships for existing accounts), a default **"Mine"** slice of kind Owned is created automatically and holds the whole balance.
- Beyond that there is **no upper limit** — add as many as life needs, and remove them when they stop mattering.
- Slices grow and shrink over time: rename, change amount, change kind, or archive. Archiving the last remaining slice is blocked; archiving any other slice moves its remaining amount back into the default slice so nothing goes missing.
- Archived slices stay attached to their past transactions for history, they just disappear from pickers and bars.

## What you'll see

**Accounts page** — each cash/bank card gains a slim slice bar under the balance: coloured segments per slice plus a grey "Unallocated" remainder, with a legend listing slice name, kind chip and amount. A slice in the red (spent past its share) is flagged.

**Account groups** — the Cash & Bank group header shows totals: Owned / Custodial / Earmarked / Unallocated across the group.

**Overview** — the net worth stat becomes "yours": custodial money is subtracted, with a one-line note ("₹20,000 held for others excluded"). A small breakdown card shows the four buckets.

**Transactions** — the existing label picker becomes the slice picker, filtered to slices of the selected account, with the kind shown next to each name. Selecting a slice is what moves it.

**Manage slices** — a dialog from the account card to add/edit/archive slices: name, kind, colour, starting amount, and (for earmarks) target amount and date. The dialog enforces the "at least one slice" rule.

## Technical plan

### Migration

1. New enum `slice_kind` = `owned | custodial | earmark`.
2. Extend `public.labels` (labels become slices):
   - `account_id uuid null references public.accounts(id)` — null keeps a label as a plain tag; non-null makes it a slice.
   - `kind slice_kind not null default 'owned'`
   - `opening_amount bigint not null default 0` — the slice's starting balance, in minor units.
   - `target_amount bigint null`, `target_date date null` — earmarks only.
   - `is_default boolean not null default false` — the fallback slice that cannot be archived.
   - Validation trigger (not a CHECK, per the time/data rule): a slice's `account_id` must belong to the same user; target fields only on `earmark`; account kind must be `bank`, `cash` or `investment`; soft-deleting the last active slice of an account is rejected.
   - Trigger on `accounts` insert: create the default "Mine" slice (Owned, opening amount = account opening balance) for eligible account kinds.
   - Backfill: one default slice per existing eligible account, seeded with that account's opening balance.
   - Partial unique indexes: `(account_id, lower(name))` and one default slice per account, both where not soft-deleted.
   - Index on `(user_id, account_id)`.
   - Existing RLS policies on `labels` already scope to `auth.uid()`; no policy change needed, grants stay as-is.
3. New views (all `security_invoker = true`):
   - `v_account_slices` — per slice: `opening_amount + sum(entries on transactions carrying that label, for that account)` = current amount, plus name, kind, colour, default flag, target fields.
   - `v_account_allocation` — per account: balance, allocated total, unallocated remainder, slice count, and per-kind subtotals.
   - `v_net_worth_owned` — net worth minus custodial totals, alongside owned/earmarked/custodial breakdown.

Nothing is destroyed: rows already in `labels` stay as plain tags (no account), exactly as they behave today.

### App wiring

- `src/data/schema.ts` — extend `Label` with `account_id`, `kind`, `opening_amount`, `target_amount`, `target_date`, `is_default`; add `Slice` and `AccountAllocation` types for the view rows.
- `src/data/live.ts` — `liveSlices()` and `liveAllocations()` reading the two views; extend `liveLabels` selection with the new columns.
- `src/data/repository.ts` — `getSlices()` / `getAllocations()` with a demo fallback; extend `src/data/seed/taxonomy.ts` so the mock ledger has Mine / Mom / Emergency slices on the primary bank and cash accounts, and derive allocations in TypeScript for the mock path only.
- `src/data/mutations.ts` — `createSlice` / `updateSlice` / `archiveSlice` (with the last-slice guard) for the mock path, mirrored by Supabase writes when signed in.
- `src/components/mm-ui.tsx` — new `SliceBar` (segmented bar + legend) reusing the existing chart colour tokens and hover micro-interaction.
- `src/routes/accounts.tsx` — slice bar and legend on bank/cash cards, group-level totals, "Manage slices" entry point.
- `src/routes/index.tsx` — net-worth-excluding-custodial plus the breakdown card.
- `src/components/add-record-dialog.tsx` — slice picker scoped to the chosen account; add a "Slice" record type; new accounts get their default slice.
- `src/routes/transactions.tsx` — show the slice chip with its kind in the row and detail panel.

### Notes

- Slice amounts are derived, never stored — same rule as account balances.
- Unallocated is always `account balance − sum(slices)`; it can go negative if slices are over-declared, and the UI says so rather than hiding it.
- Multi-currency is unaffected: a slice inherits its account's currency.
