# P3-5 — Period comparison statistics

**Phase:** 3 · **Depends on:** none (data already exists)

## Problem

The overview, accounts, and reports pages previously showed hardcoded percentage deltas like
"+9.4% this quarter" and "+12.4% vs last month". These placeholders were removed — the
StatCards now display values without the misleading fake percentages.

This plan implements real calculations to bring those deltas back with actual data.

## Current data availability (verified)

| Data | Source | Historical depth |
|---|---|---|
| Monthly income/expense | `v_monthly_cashflow` → `liveMonthlyRollups()` | 12 months |
| Account balance trend | `Account.trend` (12 points) | ~12 data points per account |
| Account change_pct | `live.ts:178` calculates from first/last trend point | Single value, already real |
| Net worth breakdown | `summariseNetWorth()` — live calculation | Point-in-time only |

The **gap**: net worth by category (cash, investments, liabilities) has no monthly history
stored. We can calculate current totals but cannot compare to "last month" without either:
1. Storing monthly snapshots, or
2. Deriving from transaction flow (income minus expense approximates balance change)

## Approach

### Phase A — Use what exists (no schema changes)

For **income/expense/savings rate** (reports page):
- `MonthlyRollup[]` already has 12 months of data
- Compare current period to prior period: `(current - prior) / prior * 100`
- This is accurate and requires no new queries

For **cash/investments/liabilities** (overview, accounts):
- Use the existing `Account.change_pct` which is calculated from the 12-point trend
- This is already real data — the sparklines use the same source
- The individual account cards already show this; roll it up to category level

For **net worth quarter-over-quarter**:
- Derive from `MonthlyRollup` data: sum 3 months of net cashflow, compare to prior 3 months
- Approximation: net cashflow ≈ net worth change (ignores investment appreciation)
- Good enough for Phase A; flag as "based on cashflow" if needed

### Phase B — Accurate historical tracking (future, requires migration)

Store monthly net worth snapshots in a new table:
```sql
create table public.net_worth_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  period_month date not null, -- first of month
  cash bigint not null,
  investments bigint not null,
  liabilities bigint not null,
  net_worth bigint not null,
  created_at timestamptz default now(),
  unique(user_id, period_month)
);
```

Populate via:
1. A cron job that snapshots at month-end
2. Backfill from transaction history where possible

This gives exact month-over-month comparisons for all categories.

## Implementation — Phase A

### New functions in `src/data/repository.ts`

```typescript
export interface PeriodComparison {
  current: Paise;
  prior: Paise;
  delta_pct: number | null; // null if prior is 0
}

/** Compare two consecutive periods from monthly rollups. */
export function compareCashflow(
  rollups: MonthlyRollup[],
  metric: 'income' | 'expense' | 'net'
): PeriodComparison {
  const sorted = [...rollups].sort((a, b) => b.period.localeCompare(a.period));
  const current = sorted[0];
  const prior = sorted[1];
  if (!current || !prior) return { current: 0, prior: 0, delta_pct: null };
  
  const getValue = (r: MonthlyRollup) => {
    if (metric === 'net') return r.income - r.expense;
    return r[metric];
  };
  
  const c = getValue(current);
  const p = getValue(prior);
  return {
    current: c,
    prior: p,
    delta_pct: p === 0 ? null : ((c - p) / Math.abs(p)) * 100,
  };
}

/** Roll up account change percentages by kind. */
export function aggregateAccountChange(
  accounts: Account[],
  kinds: AccountKind[]
): number | null {
  const relevant = accounts.filter(a => kinds.includes(a.kind));
  if (relevant.length === 0) return null;
  
  // Weight by absolute balance
  const totalWeight = relevant.reduce((s, a) => s + Math.abs(a.balance), 0);
  if (totalWeight === 0) return null;
  
  const weightedSum = relevant.reduce(
    (s, a) => s + a.change_pct * Math.abs(a.balance),
    0
  );
  return weightedSum / totalWeight;
}

/** Quarter-over-quarter net worth change derived from cashflow. */
export function quarterOverQuarter(rollups: MonthlyRollup[]): number | null {
  const sorted = [...rollups].sort((a, b) => b.period.localeCompare(a.period));
  if (sorted.length < 6) return null;
  
  const currentQ = sorted.slice(0, 3);
  const priorQ = sorted.slice(3, 6);
  
  const sum = (rs: MonthlyRollup[]) => 
    rs.reduce((s, r) => s + (r.income - r.expense), 0);
  
  const c = sum(currentQ);
  const p = sum(priorQ);
  return p === 0 ? null : ((c - p) / Math.abs(p)) * 100;
}
```

### Changes to pages

**index.tsx (overview)**
```typescript
// In loader or component
const cashDelta = aggregateAccountChange(accounts, ['bank', 'cash']);
const investmentDelta = aggregateAccountChange(accounts, ['investment']);
const liabilityDelta = aggregateAccountChange(accounts, ['credit_card', 'loan']);
const qoqDelta = quarterOverQuarter(rollups);

// In JSX
<Panel title="Net worth" action={
  qoqDelta !== null && (
    <span className={`numeric text-xs ${qoqDelta >= 0 ? 'text-success' : 'text-destructive'}`}>
      {formatPct(qoqDelta)} this quarter
    </span>
  )
}>

<StatCard
  label="Available cash"
  value={formatMoney(nw.cash, { whole: true })}
  delta={cashDelta ?? undefined}
  hint={cashDelta !== null ? "vs last month" : undefined}
  icon={<Wallet className="h-4 w-4" />}
/>
```

**accounts.tsx** — same pattern as overview

**reports.tsx**
```typescript
const incomeComp = compareCashflow(rollups, 'income');
const expenseComp = compareCashflow(rollups, 'expense');

// Savings rate comparison
const currentRate = income === 0 ? 0 : ((income - expense) / income) * 100;
const priorRate = incomeComp.prior === 0 ? 0 
  : ((incomeComp.prior - expenseComp.prior) / incomeComp.prior) * 100;
const rateDelta = priorRate === 0 ? null : currentRate - priorRate;

<StatCard
  label="Income (6 mo)"
  value={formatMoney(income, { whole: true })}
  delta={incomeComp.delta_pct ?? undefined}
  hint={incomeComp.delta_pct !== null ? "vs prior period" : undefined}
/>
```

## Files to modify

- `src/data/repository.ts` — add comparison functions
- `src/routes/index.tsx` — wire up real deltas
- `src/routes/accounts.tsx` — wire up real deltas  
- `src/routes/reports.tsx` — wire up real deltas

## Done when

- All StatCards show real calculated deltas (or nothing if insufficient data)
- Quarter-over-quarter net worth shows in the overview panel header
- Deltas are directionally correct: positive when things improved, negative otherwise
- Liabilities show negative delta as green (paying down debt is good)

## Out of scope (Phase B)

- Accurate investment appreciation tracking
- Month-end snapshot table and backfill
- Sub-monthly granularity

## Edge cases

- New user with < 2 months of data: show no delta (null)
- Account with zero balance: exclude from weighted average
- Prior period is zero: show no delta (avoid division by zero)
- Liabilities: invert the color logic (negative balance going more negative = bad)
