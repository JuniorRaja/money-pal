import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ImportWizard, type StageResult } from "@/components/import/import-wizard";
import {
  TeachScreen,
  type TeachAssignment,
  type TeachReviewState,
} from "@/components/onboarding/teach-screen";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bulkCommitImportRows } from "@/data/mutations";
import {
  getAccounts,
  getCategories,
  getImportJobQueue,
  getImportProfiles,
  getImportRules,
  getImportSources,
} from "@/data/repository";
import type {
  Account,
  Category,
  ImportJobRow,
  ImportProfile,
  ImportRule,
  ImportSource,
} from "@/data/schema";
import { matchFieldForGroup } from "@/lib/import/group";
import { buildTeachGroups } from "@/lib/import/teach";
import { useSession } from "@/components/session";
import { cn } from "@/lib/utils";

export type ImportFlow =
  | { kind: "import"; sourceId?: string; file?: File | null }
  | { kind: "review"; jobId: string; focusId?: string };

export function ImportFlowDialog({
  flow,
  onClose,
  onFinished,
}: {
  flow: ImportFlow | null;
  onClose: () => void;
  onFinished: () => void;
}) {
  const { prefs } = useSession();
  const [phase, setPhase] = useState<"import" | "review">(
    flow?.kind === "review" ? "review" : "import",
  );
  const [jobId, setJobId] = useState(flow?.kind === "review" ? flow.jobId : "");
  const [boot, setBoot] = useState<{
    accounts: Account[];
    sources: ImportSource[];
    profiles: ImportProfile[];
    categories: Category[];
    rules: ImportRule[];
  } | null>(null);
  const [queue, setQueue] = useState<ImportJobRow[] | null>(null);
  const [reviewState, setReviewState] = useState<TeachReviewState>({
    groups: [],
    assignments: new Map<string, TeachAssignment>(),
  });
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    setPhase(flow?.kind === "review" ? "review" : "import");
    setJobId(flow?.kind === "review" ? flow.jobId : "");
    setQueue(null);
    setReviewState({ groups: [], assignments: new Map() });
  }, [flow]);

  useEffect(() => {
    if (!flow) {
      setBoot(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      getAccounts(),
      getImportSources(),
      getImportProfiles(),
      getCategories(),
      getImportRules(),
    ]).then(([accounts, sources, profiles, categories, rules]) => {
      if (!cancelled) setBoot({ accounts, sources, profiles, categories, rules });
    });
    return () => {
      cancelled = true;
    };
  }, [flow]);

  useEffect(() => {
    if (!flow || phase !== "review" || !jobId) return;
    let cancelled = false;
    void getImportJobQueue(jobId).then((rows) => {
      if (!cancelled) setQueue(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [flow, jobId, phase]);

  function handleStaged(result: StageResult) {
    if (result.rows_done >= result.rows_total) {
      toast.success("Nothing new to review", {
        description: `${result.duplicates} duplicate rows skipped.`,
      });
      onFinished();
      return;
    }
    setJobId(result.job_id);
    setReviewState({ groups: [], assignments: new Map() });
    setPhase("review");
  }

  const onReviewStateChange = useCallback((state: TeachReviewState) => {
    setReviewState(state);
  }, []);

  const onImportAnyway = useCallback(async () => {
    if (!queue || !boot) return;
    setCommitting(true);
    try {
      const groups = reviewState.groups.length
        ? reviewState.groups
        : buildTeachGroups(queue, boot.categories);
      const categoryForGroup = new Map<string, string>();
      for (const group of groups) {
        const assignment = reviewState.assignments.get(group.id);
        const suggested = group.suggestedCategoryName
          ? boot.categories.find((c) => c.name === group.suggestedCategoryName)?.id
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
      onFinished();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this statement");
    } finally {
      setCommitting(false);
    }
  }, [boot, onFinished, queue, reviewState]);

  const open = Boolean(flow);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-2xl overflow-hidden",
          phase === "review" && "sm:max-w-4xl max-h-[90dvh]",
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{phase === "review" ? "Teach your statement" : "New import"}</DialogTitle>
          <DialogDescription>
            {phase === "review"
              ? "A choice applies to every payment in that group."
              : "The file stays in this browser. We detect the bank and map columns."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {!boot ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : phase === "import" && flow?.kind === "import" ? (
            <ImportWizard
              key={flow.sourceId ?? "new"}
              accounts={boot.accounts}
              sources={boot.sources}
              profiles={boot.profiles}
              categories={boot.categories}
              rules={boot.rules}
              sourceId={flow.sourceId}
              initialFile={flow.file ?? null}
              onStaged={handleStaged}
            />
          ) : phase === "review" ? (
            queue == null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading queue…</p>
            ) : queue.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">All rows already processed.</p>
                <button
                  type="button"
                  className="mt-4 h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                  onClick={onFinished}
                >
                  Done
                </button>
              </div>
            ) : (
              <TeachScreen
                rows={queue}
                categories={boot.categories}
                aiEnabled={prefs.aiCategorization}
                onImportAnyway={() => void onImportAnyway()}
                onReviewStateChange={onReviewStateChange}
              />
            )
          ) : null}
        </div>
        {committing && (
          <p className="py-2 text-center text-sm text-muted-foreground">Importing…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
