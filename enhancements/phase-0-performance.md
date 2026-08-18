# Phase 0: Performance Audit & Optimization

> **Priority:** Critical — must complete before feature work  
> **Scope:** Medium  
> **Dependencies:** None  
> **Status:** Not Started

---

## Objective

Audit and fix data fetching patterns to ensure the app scales beyond 20K transactions. Currently, `listTransactions()` fetches all user transactions regardless of the selected month, with filtering done client-side.

---

## Problem Statement

```
User selects "August 2026" in Transactions page
  → liveTransactions() fetches ALL transactions (e.g., 20,000 rows)
  → filterTransactions() filters to ~150 rows client-side
  → User waits 5+ seconds, browser memory spikes
```

This pattern exists across multiple routes and will cause performance degradation as user data grows.

---

## Tasks

### 0.1 Transaction Pagination Audit

**Goal:** Document which routes need all data vs. which can filter server-side

- [ ] Map all consumers of `liveTransactions()`:
  - `/transactions` route
  - `/reports` route  
  - Dashboard timeline
  - `deriveTimelineEvents()` in `timeline.ts`
  - Any other loaders
- [ ] For each consumer, document:
  - What data range is actually needed
  - Whether server-side filtering is feasible
  - Breaking changes if data shape changes
- [ ] Write findings to `docs/performance-audit.md`

**Files to review:**
- `src/data/repository.ts` — `listTransactions()`, `filterTransactions()`
- `src/data/live.ts` — `liveTransactions()`
- `src/routes/transactions.tsx` — loader
- `src/routes/reports.tsx` — loader
- `src/routes/index.tsx` — dashboard loader
- `src/lib/timeline.ts` — `deriveTimelineEvents()`

---

### 0.2 Server-Side Period Filtering

**Goal:** Move period filtering to the database query

- [ ] Add optional `period` parameter to `liveTransactions(period?: string)`
- [ ] Update Supabase query to filter `occurred_at`:
  ```sql
  -- For period "2026-08"
  WHERE occurred_at >= '2026-08-01T00:00:00+05:30'
    AND occurred_at < '2026-09-01T00:00:00+05:30'
  ```
- [ ] Handle timezone correctly (IST for this app)
- [ ] Update `/transactions` loader to pass selected period
- [ ] Keep `filterTransactions()` for additional client-side filters (search, account, category)

**Files to modify:**
- `src/data/live.ts`
- `src/data/repository.ts`
- `src/routes/transactions.tsx`

---

### 0.3 Cursor-Based Pagination

**Goal:** For long lists, implement "load more" pagination

- [ ] Design cursor format (timestamp + id for stable ordering)
- [ ] Add to `liveTransactions()`:
  ```typescript
  interface TransactionPage {
    rows: Transaction[];
    nextCursor: string | null;
    hasMore: boolean;
  }
  ```
- [ ] Page size: 50 rows (configurable)
- [ ] Update Transactions page to:
  - Load first page on mount
  - "Load more" button or infinite scroll
  - Maintain scroll position
- [ ] Consider: Is pagination needed for Reports? (Probably aggregates only)

**Files to modify:**
- `src/data/live.ts`
- `src/data/repository.ts`
- `src/routes/transactions.tsx`

---

### 0.4 Timeline Derivation Optimization

**Goal:** Make "unusually large spend" analysis efficient at scale

Current implementation in `largeTransactionEvents()`:
1. Groups ALL expenses by category
2. Calculates median for each category
3. Flags outliers

**Options to evaluate:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Materialized view** | Fast reads, SQL handles aggregation | Needs refresh strategy |
| **B. Compute on import** | Pre-calculated, instant reads | Stale if old transactions edited |
| **C. Trailing window** | Only fetch 6 months of data | Still could be 5K+ rows |
| **D. Background job** | Async, doesn't block page load | Adds complexity |

- [ ] Benchmark current implementation with 20K rows
- [ ] Implement chosen solution
- [ ] Ensure analysis still works for:
  - Dashboard timeline
  - Email alerts (Phase 6)

**Files to modify:**
- `src/lib/timeline.ts`
- Possibly new migration for materialized view

---

### 0.5 Network Waterfall Review

**Goal:** Ensure each route only loads what it needs

- [ ] Audit each route loader for unnecessary parallel fetches
- [ ] Check for duplicate data across loaders (e.g., accounts loaded everywhere)
- [ ] Consider shared layout loaders for common data
- [ ] Document findings

**Routes to audit:**
- `/` (dashboard)
- `/transactions`
- `/accounts`
- `/budgets`
- `/goals`
- `/reports`
- `/imports`
- `/settings`

---

### 0.6 Performance Regression Test

**Goal:** Verify acceptable performance with realistic data volume

- [ ] Create seed script: `scripts/seed-perf-test.ts`
  - Generate 20,000 transactions over 24 months
  - Realistic distribution across categories
  - Various amounts and merchants
- [ ] Define acceptable thresholds:
  - `/transactions` initial load: < 2s
  - `/reports` initial load: < 3s
  - Dashboard: < 2s
  - Memory usage: < 200MB
- [ ] Run tests before and after optimizations
- [ ] Document results in `docs/performance-benchmarks.md`

---

## Acceptance Criteria

- [ ] `/transactions` loads selected month in < 2s with 20K total transactions
- [ ] Memory usage stays under 200MB on transaction-heavy pages
- [ ] No regressions in existing functionality
- [ ] Audit documentation complete
- [ ] Performance benchmarks documented

---

## Technical Notes

### Supabase Query Patterns

```typescript
// Current (inefficient)
const { data } = await supabase
  .from('v_transactions')
  .select('*')
  .order('occurred_at', { ascending: false });

// Improved (server-side filter)
const { data } = await supabase
  .from('v_transactions')
  .select('*')
  .gte('occurred_at', periodStart)
  .lt('occurred_at', periodEnd)
  .order('occurred_at', { ascending: false })
  .limit(50);
```

### IST Date Handling

The app uses IST (UTC+5:30). Be careful with period boundaries:
```typescript
// "2026-08" → IST boundaries
const start = '2026-08-01T00:00:00+05:30';
const end = '2026-09-01T00:00:00+05:30';
```

### Cursor Format

Recommended: `${occurred_at}|${id}` for stable pagination
```typescript
const cursor = `2026-08-07T11:40:00+05:30|abc123`;
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking timeline analysis with partial data | Implement trailing window (6 months) for analysis |
| Stale pagination if data changes | Use timestamp+id cursor, refresh on data mutation |
| Timezone bugs | Unit tests for IST boundary cases |

---

## Definition of Done

- [ ] All tasks completed
- [ ] Performance benchmarks meet thresholds
- [ ] No TypeScript errors
- [ ] Existing tests pass
- [ ] Code reviewed
- [ ] Documentation updated
