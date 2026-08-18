# Performance Audit — Transaction Fetching (Phase 0.1)

_Audited: 2026-08-18. Scope: every consumer of `liveTransactions()` /
`listTransactions()` and the data range each actually needs._

## Headline finding

The plan's premise ("fetches ALL 20,000 rows") is **out of date**.
`liveTransactions()` already caps every read at `.limit(500)`
([src/data/live.ts](../src/data/live.ts)). That cap is not a perf guard — it is a
**latent correctness bug**: once a user passes 500 lifetime transactions, the
oldest ones silently disappear from every consumer below (older months vanish
from the Transactions page, the Reports category table under-counts, goal
contributions can't find their originating txn, timeline median skews).

Server-side period filtering (0.2) is the fix: a month-scoped read returns one
month's rows (well under 500), so the cap never bites for scoped reads. The cap
stays only as a safety net on the remaining **unscoped** reads.

## Consumer map

| Consumer | Call site | Range actually needed | Server-side filter feasible? |
|---|---|---|---|
| Assistant context | [repository.ts:357](../src/data/repository.ts) | current month only — already `{ period: CURRENT_PERIOD }` | **Yes — now server-side** ✅ |
| Transactions page | [transactions.tsx](../src/routes/transactions.tsx) | current month by default; **all-time on `?q=` search** | **Yes — now URL-scoped loader fetch** ✅ |
| Reports page | [reports.tsx:48](../src/routes/reports.tsx) | category table sums **all-time** (last 500) | No — genuinely wants all history; belongs on a rollup/view, not a row fetch |
| Dashboard | [index.tsx:84](../src/routes/index.tsx) | this month **+ last month** for the MoM panel | Partial — a 2-month window would work but adds complexity; deferred |
| Goals page | [goals.tsx:68](../src/routes/goals.tsx) | contribution history across time | No — wants history |
| Timeline derivation | [repository.ts:319](../src/data/repository.ts) | trailing window for large-spend median | Trailing window (deferred, task 0.4) |
| Goal contributions | [live.ts:483](../src/data/live.ts) | only txns referenced by a contribution | No — keyed by `transaction_id`, not period |

## What 0.2 changed

- Added `periodBounds(period)` → IST `[start, end)` instants
  ([period.ts](../src/lib/period.ts), unit-tested in `period.test.ts`).
- `liveTransactions(period?)` applies `.gte(start).lt(end)` on `occurred_at`
  when a period is given.
- `listTransactions({ period })` threads the period to the DB;
  `filterTransactions` still re-applies it plus search/account/category
  client-side (defense in depth on the IST calendar-day edge).

Net effect on non-UI callers: **zero behavior change**. The assistant context
(the only consumer that already passed a fixed period) now issues a smaller
query with an identical result.

### Transactions page — server-side period fetch

The month dropdown used to filter a 500-row client pool with no refetch. Now:

- `period` is a URL search param (`?period=2026-07` / `?period=all`); absent
  means the current month.
- `loaderDeps` + loader scope the fetch: `listTransactions({ period })`. Search
  (`?q=`) and the `all` sentinel fetch unscoped; every other selection fetches
  one month.
- The dropdown `navigate()`s instead of `setState`; account/category/type and
  search-within stay client-side over the returned month.
- Incidental fix: _Last Month_ was hardcoded `"2026-07"` →
  `shiftPeriod(CURRENT_PERIOD, -1)`.

The default August view now pulls ~one month from the DB instead of 500 rows,
and old months are reachable server-side instead of being truncated by the cap.

## Deferred (not done — needs a decision)

1. **The `.limit(500)` cap on unscoped reads** (dashboard/reports/goals/timeline)
   still truncates past 500 lifetime rows. Acceptable for the current demo data
   volume; the real fix is moving those aggregates onto SQL views/rollups
   (tasks 0.4/0.5) rather than fetching rows. Documented, not yet done.
2. Cursor pagination (0.3) and timeline materialized view (0.4) — deferred until
   the 0.6 benchmark shows a threshold actually missed.
