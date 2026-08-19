import { cn } from "@/lib/utils";

/**
 * Base skeleton — an animated placeholder block.
 * Respects reduced-motion via the global `.reduce-motion` class which
 * suppresses `animate-pulse`; the `bg-primary/10` fill ensures the
 * placeholder is still visible as a static gray block.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

/** Single line text placeholder with configurable width. */
function SkeletonText({ width = "100%", className }: { width?: string; className?: string }) {
  return <Skeleton className={cn("h-4", className)} style={{ width }} />;
}

/** Card-shaped placeholder matching the Panel component dimensions. */
function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      {children ?? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
    </div>
  );
}

/** Table row placeholder — renders columns as skeleton cells. */
function SkeletonTableRow({ columns = 5, className }: { columns?: number; className?: string }) {
  return (
    <tr className={cn("border-b border-border", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

/** Stat card placeholder matching the StatCard component layout. */
function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Sparkline chart placeholder. */
function SkeletonSparkline({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-full rounded-lg", className)} />;
}

/** Timeline feed item placeholder. */
function SkeletonTimelineItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 py-3", className)}>
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonStatCard,
  SkeletonSparkline,
  SkeletonTimelineItem,
};
