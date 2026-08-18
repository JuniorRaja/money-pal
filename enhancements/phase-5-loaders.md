# Phase 5: Loaders & Skeletons

> **Priority:** Medium  
> **Scope:** Small  
> **Dependencies:** None (can run in parallel with other phases)  
> **Status:** Not Started

---

## Objective

Add consistent loading states across all routes to improve perceived performance and eliminate layout shift.

---

## Current State

- Most routes show blank/flash during data loading
- No skeleton components
- Inconsistent loading indicators on buttons
- Layout shift when data arrives

---

## Tasks

### 5.1 Skeleton Component Library

**Goal:** Reusable skeleton primitives

Create components in `src/components/ui/skeleton.tsx`:

- [ ] `Skeleton` — base animated placeholder
- [ ] `SkeletonText` — text line placeholder (configurable width)
- [ ] `SkeletonCard` — card-shaped placeholder
- [ ] `SkeletonTableRow` — table row placeholder
- [ ] `SkeletonStatCard` — stat card placeholder
- [ ] `SkeletonSparkline` — sparkline chart placeholder

```tsx
// Base skeleton with shimmer
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
    />
  );
}

// Text line
export function SkeletonText({ width = "100%" }: { width?: string }) {
  return <Skeleton className="h-4" style={{ width }} />;
}
```

---

### 5.2 Route-Level Suspense

**Goal:** Wrap routes with skeleton fallbacks

- [ ] Create fallback components for each major route
- [ ] Use TanStack Router's `pendingComponent` or React Suspense
- [ ] Ensure skeleton matches final layout structure

```tsx
// transactions.tsx
export const Route = createFileRoute("/transactions")({
  pendingComponent: TransactionsSkeleton,
  loader: async () => { ... },
  component: TransactionsPage,
});
```

---

### 5.3 Dashboard Skeletons

**Goal:** Loading state for dashboard

Components to skeleton:
- [ ] StatCard grid (4 cards)
- [ ] Timeline feed
- [ ] Period comparison charts
- [ ] Quick actions

```tsx
function DashboardSkeleton() {
  return (
    <AppShell>
      <div className="grid grid-cols-4 gap-4">
        {Array(4).fill(0).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array(5).fill(0).map((_, i) => (
          <SkeletonTimelineItem key={i} />
        ))}
      </div>
    </AppShell>
  );
}
```

---

### 5.4 Transactions Skeleton

**Goal:** Loading state for transactions page

- [ ] Filter bar skeleton
- [ ] Table header (static)
- [ ] Table rows (shimmer)
- [ ] Match row heights to avoid shift

```tsx
function TransactionsSkeleton() {
  return (
    <AppShell>
      <div className="flex gap-3 mb-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <table className="w-full">
        <thead>...</thead>
        <tbody>
          {Array(10).fill(0).map((_, i) => (
            <SkeletonTableRow key={i} columns={6} />
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
```

---

### 5.5 Import Center Skeleton

**Goal:** Loading state for import pages

- [ ] Job cards skeleton
- [ ] Review deck placeholder
- [ ] Progress indicators

---

### 5.6 Inline Loaders

**Goal:** Button loading states for mutations

- [ ] Create `ButtonLoader` component (spinner inside button)
- [ ] Apply to all mutation buttons:
  - Save/Submit buttons
  - Delete buttons
  - Accept/Skip in import review
- [ ] Disable button while loading
- [ ] Show spinner, keep button width stable

```tsx
<Button disabled={isPending}>
  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
  {isPending ? "Saving..." : "Save"}
</Button>
```

---

### 5.7 Reduce Motion Support

**Goal:** Respect user preference for reduced motion

- [ ] Check `prefs.reduceMotion` from session
- [ ] Disable shimmer animation when enabled
- [ ] Use static gray instead of animated pulse
- [ ] Also respect `prefers-reduced-motion` media query

```tsx
const prefersReducedMotion = 
  prefs.reduceMotion || 
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

<Skeleton className={cn(
  "bg-muted",
  !prefersReducedMotion && "animate-pulse"
)} />
```

---

## Acceptance Criteria

- [ ] All major routes have skeleton fallbacks
- [ ] Skeletons match final layout (no shift)
- [ ] Shimmer animation is smooth
- [ ] Reduced motion preference respected
- [ ] Mutation buttons show loading state
- [ ] No blank flashes during navigation

---

## Technical Notes

### Shimmer Animation

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 0.1) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### TanStack Router Pending

```tsx
export const Route = createFileRoute("/path")({
  pendingComponent: () => <MySkeleton />,
  pendingMs: 200,  // show skeleton after 200ms
  pendingMinMs: 500, // show for at least 500ms to avoid flash
});
```

---

## Routes to Cover

| Route | Skeleton Components |
|-------|---------------------|
| `/` (Dashboard) | StatCards, Timeline, Charts |
| `/transactions` | Filters, Table |
| `/accounts` | Account cards, Allocation chart |
| `/budgets` | Budget cards, Progress bars |
| `/goals` | Goal cards, Contribution chart |
| `/reports` | Charts, Tables |
| `/imports` | Job cards, Review deck |
| `/settings` | Panel content |

---

## Definition of Done

- [ ] Skeleton components created and documented
- [ ] All routes have pending fallbacks
- [ ] Animations respect reduced motion
- [ ] Buttons have loading states
- [ ] No layout shift on data load
- [ ] No TypeScript errors
- [ ] Code reviewed
