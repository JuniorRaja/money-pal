import { CheckCircle2, X } from "lucide-react";

import { Bar } from "@/components/mm-ui";
import type { ImportJob } from "@/data/schema";

/**
 * One import job as a progress line. `compact` leads with the job title (lists
 * of many jobs); the default leads with the row counter (a single job in focus).
 */
export function JobProgress({
  job,
  compact,
  onReview,
  onDismiss,
}: {
  job: ImportJob;
  compact?: boolean;
  onReview?: () => void;
  onDismiss?: () => void;
}) {
  const dismissed = job.dismissed_at !== null;
  const done = job.finished_at !== null;
  const total = Math.max(job.rows_total, 1);
  const pct = Math.min(100, (job.rows_done / total) * 100);
  const open = job.rows_done < job.rows_total && !dismissed;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-foreground">
          {done && !dismissed && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />}
          <span className="truncate">
            {compact ? job.title : `${job.rows_done} of ${job.rows_total}`}
          </span>
          {dismissed && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Dismissed
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="numeric text-xs text-muted-foreground">
            {job.rows_done} / {job.rows_total}
          </span>
          {onDismiss && (
            <button
              type="button"
              aria-label={`Dismiss ${job.title}`}
              title="Dismiss this import"
              onClick={onDismiss}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      <Bar value={pct} tone={dismissed ? "muted-foreground" : done ? "success" : "primary"} />
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {done || dismissed
            ? `${job.imported} imported · ${job.duplicates} duplicates skipped`
            : `${job.imported} imported · ${job.duplicates} duplicates · ${job.rows_total - job.rows_done} still open`}
        </p>
        {open && onReview && (
          <button
            type="button"
            onClick={onReview}
            className="shrink-0 text-[11px] font-medium text-primary"
          >
            Review
          </button>
        )}
      </div>
    </div>
  );
}
