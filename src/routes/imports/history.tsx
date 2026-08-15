import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { JobProgress } from "@/components/import/job-progress";
import { Panel } from "@/components/mm-ui";
import { getImportJobHistory } from "@/data/repository";

export const Route = createFileRoute("/imports/history")({
  head: () => ({
    meta: [
      { title: "Import history — Money Pal Financial OS" },
      { name: "description", content: "Every statement import, finished or dismissed." },
    ],
  }),
  loader: async () => ({ jobs: await getImportJobHistory() }),
  pendingComponent: () => (
    <AppShell title="Import history" subtitle="Loading…" signature="imports">
      <Panel>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Panel>
    </AppShell>
  ),
  component: ImportHistory,
});

function ImportHistory() {
  const { jobs } = Route.useLoaderData();
  const navigate = useNavigate();

  return (
    <AppShell
      title="Import history"
      subtitle="Every job, including the ones you dismissed."
      signature="imports"
      actions={
        <Link
          to="/imports"
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Import Center
        </Link>
      }
    >
      <Panel title={`All jobs · ${jobs.length}`}>
        {jobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No imports yet. Drop a statement on the Import Center to start one.
          </p>
        ) : (
          <ul className="space-y-4">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobProgress
                  job={job}
                  compact
                  onReview={() => {
                    void navigate({ to: "/imports/$jobId", params: { jobId: job.id } });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AppShell>
  );
}
