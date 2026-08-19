import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ReviewDeck } from "@/components/import/review-deck";
import { Panel } from "@/components/mm-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategories, getImportJobQueue, getImportJobs, getImportRules } from "@/data/repository";

type ReviewSearch = { focus?: string };

export const Route = createFileRoute("/imports/$jobId")({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => {
    const focus = typeof search["focus"] === "string" ? search["focus"] : undefined;
    return focus ? { focus } : {};
  },
  loaderDeps: ({ search }) => ({ focus: search.focus }),
  loader: async ({ params }) => {
    const [jobs, queue, categories, rules] = await Promise.all([
      getImportJobs(),
      getImportJobQueue(params.jobId),
      getCategories(),
      getImportRules(),
    ]);
    const job = jobs.find((row) => row.id === params.jobId);
    if (!job) throw notFound();
    return { job, queue, categories, rules };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `${loaderData.job.title} — Import review` : "Import review — Money Pal",
      },
    ],
  }),
  pendingComponent: () => (
    <AppShell title="Review import" subtitle="Loading the queue…" signature="imports">
      <Panel title="Review deck">
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="flex justify-center gap-3">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      </Panel>
    </AppShell>
  ),
  pendingMs: 200,
  pendingMinMs: 500,
  component: ImportReviewPage,
});

function ImportReviewPage() {
  const { job, queue, categories, rules } = Route.useLoaderData();
  const { focus } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <AppShell
      title="Review import"
      subtitle={job.title}
      signature="imports"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/imports"
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Done for now
          </Link>
        </div>
      }
    >
      <ReviewDeck
        rows={queue}
        categories={categories}
        rules={rules}
        focusId={focus}
        onDone={() => {
          void navigate({ to: "/imports" });
        }}
      />
    </AppShell>
  );
}
