/**
 * Route-level skeleton fallbacks for every major page.
 * Each skeleton mirrors the final layout structure of its route to
 * prevent layout shift when data arrives.
 */
import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/mm-ui";
import {
  Skeleton,
  SkeletonCard,
  SkeletonStatCard,
  SkeletonTableRow,
  SkeletonTimelineItem,
} from "@/components/ui/skeleton";

// ─── Dashboard / Overview ────────────────────────────────────────────────────

export function OverviewSkeleton() {
  return (
    <AppShell
      title="Overview"
      subtitle="Everything in one calm view, as of this morning."
      signature="overview"
    >
      <div className="grid grid-cols-12 gap-5">
        {/* Net worth panel */}
        <div className="col-span-8 rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="mt-4 h-[210px] w-full rounded-xl" />
        </div>

        {/* Stat cards column */}
        <div className="col-span-4 space-y-5">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>

        {/* This month panel */}
        <div className="col-span-4 rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-28" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>

        {/* Goals panel */}
        <div className="col-span-4 rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>

        {/* Insight + bills */}
        <div className="col-span-4 space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity table */}
        <div className="col-span-8 rounded-xl border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <table className="w-full">
            <tbody>
              {Array.from({ length: 7 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={5} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Timeline feed */}
        <div className="col-span-4 rounded-xl border border-border bg-card p-5">
          <Skeleton className="mb-3 h-4 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonTimelineItem key={i} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

// ─── Transactions ────────────────────────────────────────────────────────────

export function TransactionsSkeleton() {
  return (
    <AppShell
      title="Transactions"
      subtitle="Every financial event, organised and clear."
      signature="transactions"
    >
      {/* Summary stats */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 mb-4">
        <Skeleton className="h-10 w-56 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Date", "Description", "Category", "Account", "Amount"].map((col) => (
                <th
                  key={col}
                  className="px-3 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={5} />
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function AccountsSkeleton() {
  return (
    <AppShell
      title="Accounts"
      subtitle="Everything you own, owe, and keep aside."
      signature="accounts"
    >
      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Account cards grid */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-36" />
        ))}
      </div>
    </AppShell>
  );
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

export function BudgetsSkeleton() {
  return (
    <AppShell
      title="Budgets"
      subtitle="Give every rupee a job before the month spends it for you."
      signature="budgets"
    >
      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Budget lines + pie chart */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-8 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="col-span-4 rounded-xl border border-border bg-card p-5">
          <Skeleton className="mx-auto h-48 w-48 rounded-full" />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export function GoalsSkeleton() {
  return (
    <AppShell
      title="Goals"
      subtitle="Name what you're saving for, then watch it get closer."
      signature="goals"
    >
      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Goal cards */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-5 space-y-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function ReportsSkeleton() {
  return (
    <AppShell
      title="Reports"
      subtitle="The long view: trends, ratios and exportable summaries."
      signature="reports"
    >
      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      </div>

      {/* Category breakdown table */}
      <div className="mt-5 rounded-xl border border-border bg-card p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <table className="w-full">
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={4} />
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

// ─── Imports ─────────────────────────────────────────────────────────────────

export function ImportsSkeleton() {
  return (
    <AppShell
      title="Import Center"
      subtitle="Bring statements in, keep the ledger honest."
      signature="imports"
    >
      {/* Source cards row */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-5"
          >
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Active jobs */}
      <Panel title="Active jobs">
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </Panel>

      {/* Review queue */}
      <Panel title="Waiting for you" className="mt-5">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function SettingsSkeleton() {
  return (
    <AppShell
      title="Settings"
      subtitle="Make Money Pal feel like yours."
      signature="settings"
    >
      {/* Tab bar */}
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Settings panels */}
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-28" />
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
