import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ChevronRight,
  CopyCheck,
  FileSpreadsheet,
  FileText,
  Mail,
  MoreHorizontal,
  Pause,
  Pencil,
  PencilLine,
  Play,
  Unplug,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AddRecordDialog } from "@/components/add-record-dialog";
import { AppShell } from "@/components/app-shell";
import { JobProgress } from "@/components/import/job-progress";
import { ImportFlowDialog, type ImportFlow } from "@/components/import/pipeline-modal";
import { Panel } from "@/components/mm-ui";
import { ImportsSkeleton } from "@/components/route-skeletons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  disconnectImportSource,
  dismissImportJob,
  renameImportSource,
  setImportSourcePaused,
} from "@/data/mutations";
import {
  getAccounts,
  getImportJobs,
  getImportReviewItems,
  getImportSources,
} from "@/data/repository";
import type { Account, ImportJob, ImportReviewItem, ImportSource, ReviewKind } from "@/data/schema";
import { bankPresetLabel } from "@/lib/import";
import type { BankPresetId } from "@/lib/import";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/imports/")({
  head: () => ({
    meta: [
      { title: "Import Center — Money Pal Financial OS" },
      {
        name: "description",
        content: "Bring in bank statements from CSV or Excel, then review what needs a human eye.",
      },
      { property: "og:title", content: "Import Center — Money Pal" },
      { property: "og:description", content: "Bring your money in from statements, cleanly." },
    ],
  }),
  loader: async () => {
    const [sources, jobs, review, accounts] = await Promise.all([
      getImportSources(),
      getImportJobs(),
      getImportReviewItems(),
      getAccounts(),
    ]);
    return { sources, jobs, review, accounts };
  },
  pendingComponent: ImportsSkeleton,
  pendingMs: 200,
  pendingMinMs: 500,
  component: ImportsHub,
});

function accountName(accounts: Account[], id: string | null): string | null {
  if (!id) return null;
  return accounts.find((account) => account.id === id)?.name ?? null;
}

const KIND_COPY: Record<ReviewKind, { label: string; action: string }> = {
  pending: { label: "Needs review", action: "Review" },
  held: { label: "Held", action: "Resume" },
  low_confidence: { label: "Unknown merchant", action: "Categorise" },
};

/**
 * A flat queue of everything staged is unreadable past a handful of rows, so the
 * queue is grouped by what put the row there, most urgent first, and each group
 * shows a few rows until asked for the rest. The full archive is /imports/history.
 */
const KIND_ORDER: ReviewKind[] = ["held", "low_confidence", "pending"];
const GROUP_PREVIEW = 5;
const JOB_PREVIEW = 5;
const RECENT_PREVIEW = 3;

function ImportsHub() {
  const { sources, jobs, review, accounts } = Route.useLoaderData();
  const router = useRouter();
  const csvSources = sources.filter((source) => source.kind === "csv");
  const latestCsv = csvSources[0] ?? null;
  const activeJobs = jobs.filter(
    (job) => job.finished_at === null || job.rows_done < job.rows_total,
  );
  const [rename, setRename] = useState<ImportSource | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [disconnect, setDisconnect] = useState<ImportSource | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [flow, setFlow] = useState<ImportFlow | null>(null);
  const [dismissJob, setDismissJob] = useState<ImportJob | null>(null);

  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const finishedJobs = useMemo(() => jobs.filter((job) => job.finished_at), [jobs]);
  const reviewGroups = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        items: review.filter((item) => item.kind === kind),
      })).filter((group) => group.items.length > 0),
    [review],
  );

  async function closeFlow() {
    setFlow(null);
    await router.invalidate();
  }

  return (
    <AppShell
      title="Import Center"
      subtitle="Bring statements in, keep the ledger honest."
      signature="imports"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MethodCard icon={Mail} title="Gmail" detail="Bank alerts by mail — later." soon />
        <FileMethodCard
          icon={FileSpreadsheet}
          label="CSV / Excel"
          extensions={[".csv", ".xlsx", ".xls"]}
          detail={
            latestCsv
              ? `Mapping saved · ${latestCsv.name}`
              : "Drop a statement. We detect the bank."
          }
          onOpen={(file) => setFlow({ kind: "import", file: file ?? null })}
        />
        <FileMethodCard
          icon={FileText}
          label="PDF statement"
          extensions={[".pdf"]}
          detail="Password-protected PDFs are supported."
          onOpen={(file) => setFlow({ kind: "import", file: file ?? null })}
        />
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="flex h-[88px] items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left transition-colors hover:border-primary/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <PencilLine className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Manual entry</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              Always available.
            </span>
          </span>
        </button>
      </div>

      {activeJobs.length > 0 && (
        <Panel
          className="mt-5"
          title="Imports in progress"
          action={<AllJobsLink count={activeJobs.length} shown={JOB_PREVIEW} />}
        >
          <ul className="space-y-4">
            {activeJobs.slice(0, JOB_PREVIEW).map((job) => (
              <li key={job.id}>
                <JobProgress
                  job={job}
                  compact
                  onReview={() => setFlow({ kind: "review", jobId: job.id })}
                  onDismiss={() => setDismissJob(job)}
                />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        className="mt-5"
        title="Waiting for you"
        action={
          review.length > 0 ? (
            <span className="numeric text-xs text-muted-foreground">{review.length} rows</span>
          ) : undefined
        }
      >
        {review.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing waiting. Drop a CSV or Excel statement to fill this queue.
          </p>
        ) : (
          <div className="space-y-2">
            {reviewGroups.map((group, index) => (
              <ReviewGroup
                key={group.kind}
                kind={group.kind}
                items={group.items}
                // Only the most urgent group is open — the rest are one click away.
                defaultOpen={index === 0}
                jobsById={jobsById}
                onReview={(item) =>
                  setFlow({ kind: "review", jobId: item.job_id, focusId: item.id })
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {csvSources.length > 0 && (
        <Panel className="mt-5" title="Saved CSV sources" bodyClassName="p-0">
          <ul className="divide-y divide-border/60">
            {csvSources.map((source) => {
              const paused = source.status === "paused";
              const account = accountName(accounts, source.account_id);
              const preset = source.bank_preset
                ? bankPresetLabel(source.bank_preset as BankPresetId)
                : null;
              return (
                <li
                  key={source.id}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <FileSpreadsheet className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{source.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[account, preset, paused ? "Paused" : "Ready"].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {paused ? (
                    <span className="h-8 rounded-lg border border-border px-3 text-xs leading-8 text-muted-foreground">
                      Paused
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFlow({ kind: "import", sourceId: source.id })}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs text-foreground transition-colors hover:bg-accent"
                    >
                      Sync now
                    </button>
                  )}
                  <SourceMenu
                    paused={paused}
                    onRename={() => {
                      setRename(source);
                      setRenameValue(source.name);
                    }}
                    onPause={async () => {
                      try {
                        await setImportSourcePaused(source.id, !paused);
                        await router.invalidate();
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Could not update source",
                        );
                      }
                    }}
                    onDisconnect={() => setDisconnect(source)}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {/* Two-thirds width: a short list at full page width under a 4-up card row reads as a mistake. */}
      {finishedJobs.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel
            className="lg:col-span-2"
            title="Recent imports"
            action={
              <Link to="/imports/history" className="text-xs font-medium text-primary">
                View all
              </Link>
            }
          >
            <ul className="space-y-4">
              {finishedJobs.slice(0, RECENT_PREVIEW).map((job) => (
                <li key={job.id}>
                  <JobProgress
                    job={job}
                    compact
                    onReview={() => setFlow({ kind: "review", jobId: job.id })}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <ImportFlowDialog
        flow={flow}
        onClose={() => void closeFlow()}
        onFinished={() => void closeFlow()}
      />

      <AddRecordDialog kind={manualOpen ? "transaction" : null} onOpenChange={setManualOpen} />

      <Dialog open={Boolean(rename)} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename source</DialogTitle>
          </DialogHeader>
          <input
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <DialogFooter>
            <button
              className="h-9 rounded-lg border border-border px-3 text-sm"
              onClick={() => setRename(null)}
            >
              Cancel
            </button>
            <button
              className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              onClick={async () => {
                if (!rename || !renameValue.trim()) return;
                try {
                  await renameImportSource(rename.id, renameValue.trim());
                  setRename(null);
                  await router.invalidate();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not rename");
                }
              }}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(dismissJob)} onOpenChange={(open) => !open && setDismissJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss {dismissJob?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {dismissJob
                ? `${dismissJob.rows_total - dismissJob.rows_done} unreviewed row(s) are discarded. The ${dismissJob.imported} row(s) already imported stay on the ledger, and you can import the file again later.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!dismissJob) return;
                try {
                  await dismissImportJob(dismissJob.id);
                  setDismissJob(null);
                  await router.invalidate();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not dismiss");
                }
              }}
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(disconnect)} onOpenChange={(open) => !open && setDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnect?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The profile is archived. Existing imported transactions stay on the ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!disconnect) return;
                try {
                  await disconnectImportSource(disconnect.id);
                  setDisconnect(null);
                  await router.invalidate();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not disconnect");
                }
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function MethodCard({
  icon: Icon,
  title,
  detail,
  soon,
}: {
  icon: typeof Mail;
  title: string;
  detail: string;
  soon?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[88px] items-center gap-3 rounded-2xl border border-border bg-card px-4",
        soon && "opacity-70",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {soon && (
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Soon
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function FileMethodCard({
  icon: Icon,
  label,
  extensions,
  detail,
  onOpen,
}: {
  icon: typeof Mail;
  label: string;
  extensions: string[];
  detail: string;
  onOpen: (file?: File) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen()}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        const name = file?.name.toLowerCase() ?? "";
        if (file && extensions.some((ext) => name.endsWith(ext))) onOpen(file);
      }}
      className={cn(
        "flex h-[88px] items-center gap-3 rounded-2xl border bg-card px-4 text-left transition-colors hover:border-primary/40",
        over ? "border-primary bg-primary/8" : "border-border",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function AllJobsLink({ count, shown }: { count: number; shown: number }) {
  if (count <= shown) return null;
  return (
    <Link to="/imports/history" className="text-xs font-medium text-primary">
      All {count} jobs
    </Link>
  );
}

/**
 * `<details>` rather than a state-driven panel: open/close, keyboard and screen
 * reader semantics come free, and the group needs no state until "show more".
 */
function ReviewGroup({
  kind,
  items,
  defaultOpen,
  jobsById,
  onReview,
}: {
  kind: ReviewKind;
  items: ImportReviewItem[];
  defaultOpen: boolean;
  jobsById: Map<string, ImportJob>;
  onReview: (item: ImportReviewItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const copy = KIND_COPY[kind];
  const visible = expanded ? items : items.slice(0, GROUP_PREVIEW);
  const duplicates = items.filter((item) => item.possible_duplicate).length;

  return (
    <details open={defaultOpen} className="group rounded-xl border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="flex-1 truncate text-sm text-foreground">{copy.label}</span>
        {duplicates > 0 && (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            {duplicates} possible duplicate{duplicates === 1 ? "" : "s"}
          </span>
        )}
        <span className="numeric shrink-0 text-xs text-muted-foreground">{items.length}</span>
      </summary>
      <ul className="space-y-2 border-t border-border/60 p-3">
        {visible.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-accent/40 p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <span className="truncate">
                  {formatMoney(item.amount_paise, { sign: false })} {item.title}
                </span>
                {item.possible_duplicate && (
                  <span
                    title="Matches an existing transaction"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                  >
                    <CopyCheck className="h-3 w-3" /> Possible duplicate
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.detail}
                {jobsById.get(item.job_id)?.title ? ` · ${jobsById.get(item.job_id)?.title}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onReview(item)}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-[11px] font-medium text-primary-foreground"
            >
              {copy.action}
            </button>
          </li>
        ))}
        {items.length > visible.length && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full rounded-xl border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Show {items.length - visible.length} more
            </button>
          </li>
        )}
      </ul>
    </details>
  );
}

function SourceMenu({
  paused,
  onRename,
  onPause,
  onDisconnect,
}: {
  paused: boolean;
  onRename: () => void;
  onPause: () => void;
  onDisconnect: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Source options"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onRename} className="gap-2">
          <Pencil className="h-3.5 w-3.5" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPause} className="gap-2">
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDisconnect}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Unplug className="h-3.5 w-3.5" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
