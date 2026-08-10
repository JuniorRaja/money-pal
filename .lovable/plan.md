# Pockets: splitting an account balance by label

Turn today's transaction labels into **pockets** — named slices of a single account's balance, so ₹70,000 in one bank account reads as ₹50,000 Mine, ₹20,000 Mom's, and spending on Mom's train ticket pulls the Mom slice (and the account total) down.

## Kinds

Every pocket carries a kind, because the money means different things:

- **Owned** — genuinely yours. Counts fully in net worth.
- **Custodial** — someone else's money you hold and owe back (Mom's ₹20,000). Excluded from net worth.
- **Earmark** — yours, but committed (emergency reserve, trip fund). Counts in net worth, can carry a target date and target amount.

Pockets belong to one account each. A "Mom" pocket in the bank account and a "Mom" pocket in cash are separate slices. Credit cards and loans stay out of scope for now — pockets apply to bank, cash and investment accounts.

## What you'll see

**Accounts page** — each cash/bank card gains a slim allocation bar under the balance: coloured segments per pocket plus a grey "Unallocated" remainder, with a legend listing pocket name, kind chip and amount. A pocket in the red (spent past its slice) is flagged.

**Account groups** — the Cash & Bank group header shows totals: Owned / Custodial / Earmarked / Unallocated across the group.

**Overview** — the net worth stat becomes "yours": custodial money is subtracted, with a one-line note ("₹20,000 held for others excluded"). A small breakdown card shows the four buckets.

**Transactions** — the existing label picker becomes the pocket picker, filtered to pockets of the selected account, with the kind shown next to each name. Selecting a pocket is what moves the slice.

**Manage pockets** — a dialog from the account card to add/edit/archive a pocket: name, kind, colour, starting amount, and (for earmarks) target amount and date.

## Technical plan

### Migration

1. New enum `pocket_kind` = `owned | custodial | earmark`.
2. Extend `public.labels` (labels become pockets):
   - `account_id uuid null references public.accounts(id)` — null keeps a label as a plain tag; non-null makes it a pocket.
   - `kind pocket_kind not null default 'owned'`
   - `opening_amount bigint not null default 0` — the slice's starting balance, in minor units.
   - `target_amount bigint null`, `target_date date null` — earmarks only.
   - Validation trigger (not a CHECK, per the time/data rule): a pocket's `account_id` must belong to the same user; target fields only on `earmark`; account kind must be `bank`, `cash` or `investment`.
   - Partial unique index on `(account_id, lower(name))` where not soft-deleted.
   - Index on `(user_id, account_id)`.
   - Existing RLS policies on `labels` already scope to `auth.uid()`; no policy change needed, grants stay as-is.
3. New views (all `security_invoker = true`):
   - `v_account_pockets` — per pocket: `opening_amount + sum(entries on transactions carrying that label, for that account)` = current amount, plus name, kind, colour, target fields.
   - `v_account_allocation` — per account: balance, allocated total, unallocated remainder, and per-kind subtotals.
   - `v_net_worth_owned` — net worth minus custodial totals, alongside owned/earmarked/custodial breakdown.

Nothing is destroyed: rows already in `labels` become `owned` pockets with no account, i.e. plain tags, exactly as they behave today.

### App wiring

- `src/data/schema.ts` — extend `Label` with `account_id`, `kind`, `opening_amount`, `target_amount`, `target_date`; add a `Pocket`/`AccountAllocation` type for the view rows.
- `src/data/live.ts` — `livePockets()` and `liveAllocations()` reading the two views; extend `liveLabels` selection with the new columns.
- `src/data/repository.ts` — `getPockets()` / `getAllocations()` with a demo fallback; extend `src/data/seed/taxonomy.ts` so the mock ledger has Mine / Mom / Emergency pockets on the primary bank and cash accounts, and derive allocations in TypeScript for the mock path only.
- `src/data/mutations.ts` — `createPocket` / `updatePocket` for the mock path, mirrored by Supabase writes when signed in.
- `src/components/mm-ui.tsx` — new `AllocationBar` (segmented bar + legend) reusing the existing chart colour tokens and hover micro-interaction.
- `src/routes/accounts.tsx` — allocation bar and legend on bank/cash cards, group-level totals, "Manage pockets" entry point.
- `src/routes/index.tsx` — net-worth-excluding-custodial plus the breakdown card.
- `src/components/add-record-dialog.tsx` — pocket picker scoped to the chosen account; add a "Pocket" record type.
- `src/routes/transactions.tsx` — show the pocket chip with its kind in the row and detail panel.

### Notes

- Pocket amounts are derived, never stored — same rule as account balances.
- Unallocated is always `account balance − sum(pockets)`; it can go negative if pockets are over-declared, and the UI says so rather than hiding it.
- Multi-currency is unaffected: a pocket inherits its account's currency.
