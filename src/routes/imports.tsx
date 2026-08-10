import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Mail,
  MoreHorizontal,
  PencilLine,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Bar, Panel } from "@/components/mm-ui";
import { getImportJobs, getImportReviewItems, getImportSources } from "@/data/repository";
import type { ImportJob, ImportReviewItem, ImportSource, ImportSourceKind } from "@/data/schema";


export const Route = createFileRoute("/imports")({
  head: () => ({
    meta: [
      { title: "Import Center — Money Pal Financial OS" },
      {
        name: "description",
        content: "Bring in statements from Gmail, PDFs and CSVs, then review what needs a human eye.",
      },
      { property: "og:title", content: "Import Center — Money Pal" },
      { property: "og:description", content: "Bring your money in from everywhere, cleanly." },
    ],
  }),
  loader: async () => ({
    sources: await getImportSources(),
    jobs: await getImportJobs(),
    review: await getImportReviewItems(),
  }),
  component: ImportsPage,
});

const sourceIcon: Record<ImportSourceKind, typeof Mail> = {
  gmail: Mail,
  pdf: FileText,
  csv: FileSpreadsheet,
  manual: PencilLine,
};

function ImportsPage() {
  const { sources, jobs, review } = Route.useLoaderData() as {
    sources: ImportSource[];
    jobs: ImportJob[];
    review: ImportReviewItem[];
  };

  const running = jobs.find((j) => j.finished_at === null);
  const [progress, setProgress] = useState(running ? running.rows_done : 0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setProgress((p) => (p >= running.rows_total ? running.rows_total : p + 3));
    }, 220);
    return () => clearInterval(id);
  }, [running]);

  return (
    <AppShell
      title="Import Center"
      subtitle="Bring your money in from everywhere, cleanly."
      signature="imports"
      actions={
        <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]">
          <Upload className="h-3.5 w-3.5" /> New import
        </button>
      }
    >
      <Panel title="Connected sources" bodyClassName="p-0">
        <ul className="divide-y divide-border/60">
          {sources.map((s) => {
            const Icon = sourceIcon[s.kind];
            return (
              <li
                key={s.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.status}</p>
                </div>
                <button className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent">
                  Sync now
                </button>
                <SourceMenu />
              </li>
            );
          })}
        </ul>
      </Panel>


      <div className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-7" title="Parsing activity">
          <ul className="space-y-5">
            {jobs.map((j) => {
              const done = j.finished_at !== null;
              const rows = done ? j.rows_total : Math.min(progress, j.rows_total);
              return (
                <li key={j.id}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      {done && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                      {j.title}
                    </span>
                    <span className="numeric text-xs text-muted-foreground">
                      {rows} / {j.rows_total} rows
                    </span>
                  </div>
                  <Bar value={(rows / j.rows_total) * 100} tone={done ? "success" : "primary"} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {done
                      ? `${j.imported} imported · ${j.duplicates} duplicates skipped`
                      : "Parsing statement rows and matching merchants..."}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="col-span-5" title="Needs your eye">
          <ul className="space-y-3">
            {review.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-accent/40 p-3">
                <p className="text-sm text-foreground">{r.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                <div className="mt-3 flex gap-2">
                  <button className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
                    {r.action_label}
                  </button>
                  <button className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}

function SourceMenu() {
  const [open, setOpen] = useState(false);
  const items = ["Sync settings", "Rename source", "Pause syncing", "Disconnect"];
  return (
    <div className="relative">
      <button
        aria-label="Source options"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <ul className="rise absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
          {items.map((i) => (
            <li key={i}>
              <button
                className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-accent ${
                  i === "Disconnect" ? "text-destructive" : "text-foreground"
                }`}
              >
                {i}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

