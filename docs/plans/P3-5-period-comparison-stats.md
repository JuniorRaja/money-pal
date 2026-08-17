# P3-5 — Period comparison statistics

**Phase:** 3 · **Depends on:** none (data already exists) · **Status:** Phase A shipped

## Problem

The overview, accounts and reports pages used to show hardcoded percentage deltas like
"+9.4% this quarter" and "+12.4% vs last month". Those placeholders were removed, which left
the StatCards with a value and nothing else — and a brand new user with a wall of ₹0.

This plan brought the deltas back as real calculations, and made every page say something
useful when there is no history to compare against.

## What shipped

All comparison maths lives in **`src/lib/compare.ts`** — pure, Supabase-free, and pinned by
`src/lib/compare.test.ts` (18 cases). Every function returns `null` rather than a fabricated
number when there is no honest basis for a comparison.

### Balance deltas — from `Account.trend`, not from cashflow

The original plan proposed two things that turned out to be wrong, and both were dropped:

- **`aggregateAccountChange`** — a balance-weighted average of `Account.change_pct`. That field
  is the change across the *whole 12-point trend*, so rolling it up and labelling it
  "vs last month" would have been a mislabelled year-to-date figure.
- **`quarterOverQuarter` from cashflow** — summing three months of net cashflow and calling it
  a net worth change. An approximation presented as the real thing.

Both are unnecessary, because `Account.trend` already *is* real monthly balance history: 12
points back-cast from the current balance using `v_account_monthly_flow` deltas. `balanceTrend()`
sums those per net-worth bucket and converts back to whole paise; `balanceChange()` compares two
points on it.

The trend's newest point is today's balance and the one before it is the balance at the close of
last month, so `months: 1` reads exactly as "so far this month" and `months: 3` as "past 3 months".
This is the same series the sparklines draw, so a roll-up delta can never contradict the account
card under it.

### Cashflow deltas — month-to-date against the same days last month

`monthWindows()` cuts this month at today and last month at the same day of month, capped to its
length (31 Mar compares against 1–28 Feb). Comparing a part month against a whole one would have
shown a ~95% collapse in spending every 1st of the month.

The windows are cut on the **IST calendar day**, which surfaced a real bug: `filterTransactions`
matched periods with `occurred_at.startsWith(period)` on the raw timestamp. Postgres returns
midnight IST as `…T18:30:00+00:00`, so every transaction in the first 5.5 hours of a month was
being counted in the month before. Fixed at the source in `repository.ts`, so every caller
(transactions, budgets, overview) picked up the fix.

### Reports — complete months only

`rollupWindow()` spans the six **complete** calendar months before the running one. Half of
August against all of July is a calendar artefact, not a trend. A user with no complete months
falls back to a clearly-labelled "this month" scope. Gaps in `MonthlyRollup` read as zero (no
rows means no money moved); a prior window with no rows at all yields `null`, not a delta.

Three existing bugs on that page were fixed along the way:

- Cards labelled "(6 mo)" summed **all 12** rollups.
- `savings rate` rendered `NaN%` when income was zero — both in the headline and as `NaN`
  points on the trend line. `savingsRate()` now returns `null` and the line breaks over the gap.
- The category share denominator was recomputed inside the row map on every row.

### Sign and unit correctness

- `pctChange()` divides by `|prior|`, so a liability moving −50,000 → −30,000 reads as an
  improvement rather than flipping sign.
- Liabilities use `{ magnitude: true }` and `deltaTone="down-good"`: the card reports how much
  debt there is, and less of it renders green.
- The savings rate delta is a **percentage-point** gap, formatted `+3.2 pp` by `formatPoints()`.
  A rate moving 40% → 43% is +3 points, not +7.5%, and the two must not look alike.
- `formatPct()` clamps at `±999%+`. A near-zero baseline makes the ratio explode (₹1 → ₹1,00,000
  is +9,999,900%); the number stops meaning anything long before it stops fitting the card.
- `StatCard` reserves the delta row's height, so a card without a delta still lines up with one
  that has it, and renders a zero delta in muted grey rather than green.

### Empty and first-run states

- **Overview** — the net worth chart becomes a dashed panel with an "Import a statement" link
  when there are no rollups; the headline points at `/accounts` when no accounts exist; the
  "This month's insight" panel (which was still hardcoded prose about Dining and Transport) now
  derives its sentence from the real month-to-date comparison, or explains what is missing.
- **Accounts / Overview cards** — `balanceHint()` says *why* a delta is absent
  ("nothing here yet" / "new this month" / "no history yet") instead of leaving a bare row.
- **Reports** — both charts and the category table have their own empty states.
- **Goals** — "Saved so far" carries a real delta against last month's closing total (`saved`
  minus `saved_this_month`); "Monthly plan" shows how many goals were funded this month;
  "Overall progress" reports how many are behind schedule.

## Deliberately not done

- **"Yours after custodial" has no delta.** Custodial slice amounts are not stored historically,
  so any month-over-month figure would be about a different number than the one on the card.
- **Investment appreciation** is only visible where it hits the ledger. The trend back-cast
  follows transactions, so a holding that was repriced without one does not move the delta.
  That is the same limitation the sparklines already have.

## Phase B — accurate historical tracking (future, requires migration)

Only worth doing if the two limitations above start to matter. It needs a monthly snapshot table:

```sql
create table public.net_worth_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  period_month date not null, -- first of month
  cash bigint not null,
  investments bigint not null,
  liabilities bigint not null,
  custodial bigint not null,
  net_worth bigint not null,
  created_at timestamptz default now(),
  unique(user_id, period_month)
);
```

Populated by a month-end cron snapshot, backfilled from transaction history where possible.
That would give exact custodial history and mark-to-market investment movement.

## Files

| File | Change |
|---|---|
| `src/lib/compare.ts` | New — all comparison maths |
| `src/lib/compare.test.ts` | New — 18 cases covering the edges |
| `src/data/schema.ts` | `ACCOUNT_KINDS`, `NET_WORTH_KINDS` (single source for bucket membership) |
| `src/data/repository.ts` | `summariseNetWorth` reads the shared buckets; IST period-filter fix |
| `src/lib/money.ts` | `formatPct` clamp, new `formatPoints` |
| `src/lib/period.ts` | `daysInPeriod` extracted from `periodPace` |
| `src/components/mm-ui.tsx` | `StatCard` gains `deltaUnit` / `deltaTone`, nullable `delta` |
| `src/routes/index.tsx` | Real QoQ + MoM deltas, MTD cashflow rows, derived insight, empty states |
| `src/routes/accounts.tsx` | Real MoM deltas on the three tracked buckets |
| `src/routes/goals.tsx` | Real month delta and pace hints |
| `src/routes/reports.tsx` | Complete-month window, `pp` savings delta, three bug fixes, empty states |

## Done when

- [x] Every StatCard shows a real delta, or nothing plus a reason
- [x] Quarter-over-quarter net worth in the overview panel header
- [x] Deltas are directionally correct — positive when things improved
- [x] Liabilities render a falling balance as green
- [x] A brand new user sees explanations rather than blank rows and ₹0 walls
