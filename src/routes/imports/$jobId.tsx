import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { TeachScreen, type TeachReviewState } from "@/components/onboarding/teach-screen";
import { Panel } from "@/components/mm-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { bulkCommitImportRows } from "@/data/mutations";
import { getCategories, getImportJobQueue, getImportJobs } from "@/data/repository";
import { matchFieldForGroup } from "@/lib/import/group";
import { buildTeachGroups } from "@/lib/import/teach";
import { useSession } from "@/components/session";

export const Route = createFileRoute("/imports/$jobId")({
  loader: async ({ params }) => {
    const [jobs, queue, categories] = await Promise.all([
      getImportJobs(),
      getImportJobQueue(params.jobId),
      getCategories(),
    ]);
    const job = jobs.find((row) => row.id === params.jobId);
    if (!job) throw notFound();
    return { job, queue, categories };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.job.title} — Import review`
          : "Import review — Money Mate",
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
  const { job, queue, categories } = Route.useLoaderData();
  const navigate = useNavigate();
  const { prefs } = useSession();
  const [reviewState, setReviewState] = useState<TeachReviewState>({
    groups: [],
    assignments: new Map(),
  });
  const [committing, setCommitting] = useState(false);

  const onReviewStateChange = useCallback((state: TeachReviewState) => {
    setReviewState(state);
  }, []);

  const onImportAnyway = useCallback(async () => {
    setCommitting(true);
    try {
      const groups = reviewState.groups.length
        ? reviewState.groups
        : buildTeachGroups(queue, categories);
      const categoryForGroup = new Map<string, string>();
      for (const group of groups) {
        const assignment = reviewState.assignments.get(group.id);
        const suggested = group.suggestedCategoryName
          ? categories.find((c) => c.name === group.suggestedCategoryName)?.id
          : undefined;
        const categoryId =
          assignment?.categoryId ?? (group.band === "settled" ? suggested : undefined);
        if (categoryId) categoryForGroup.set(group.id, categoryId);
      }
      const rows = groups.flatMap((group) => {
        const categoryId = categoryForGroup.get(group.id) ?? null;
        return group.rowIds.map((row_id) => ({ row_id, suggested_category_id: categoryId }));
      });
      const rules = groups.flatMap((group) => {
        const category_id = categoryForGroup.get(group.id);
        if (!category_id || !group.key.trim()) return [];
        return [{
          pattern: group.key,
          category_id,
          account_id: null,
          match_field: matchFieldForGroup(group),
        }];
      });
      if (rows.length) await bulkCommitImportRows({ rows, rules });
      toast.success(rows.length ? "Statement imported." : "Nothing left to import.");
      void navigate({ to: "/imports" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this statement");
    } finally {
      setCommitting(false);
    }
  }, [categories, navigate, queue, reviewState]);

  return (
    <AppShell
      title="Teach your statement"
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
      {committing ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Importing…</p>
      ) : queue.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">All rows already processed.</p>
          <Link
            to="/imports"
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Done
          </Link>
        </div>
      ) : (
        <TeachScreen
          rows={queue}
          categories={categories}
          aiEnabled={prefs.aiCategorization}
          onImportAnyway={() => void onImportAnyway()}
          onReviewStateChange={onReviewStateChange}
        />
      )}
    </AppShell>
  );
}
