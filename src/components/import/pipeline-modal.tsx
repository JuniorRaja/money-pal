import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ImportWizard, type StageResult } from "@/components/import/import-wizard";
import { ReviewDeck } from "@/components/import/review-deck";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [phase, setPhase] = useState<"import" | "review">(
    flow?.kind === "review" ? "review" : "import",
  );
  const [jobId, setJobId] = useState(flow?.kind === "review" ? flow.jobId : "");
  const [focusId, setFocusId] = useState(flow?.kind === "review" ? flow.focusId : undefined);
  const [boot, setBoot] = useState<{
    accounts: Account[];
    sources: ImportSource[];
    profiles: ImportProfile[];
    categories: Category[];
    rules: ImportRule[];
  } | null>(null);
  const [queue, setQueue] = useState<ImportJobRow[] | null>(null);

  useEffect(() => {
    setPhase(flow?.kind === "review" ? "review" : "import");
    setJobId(flow?.kind === "review" ? flow.jobId : "");
    setFocusId(flow?.kind === "review" ? flow.focusId : undefined);
    setQueue(null);
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
    setFocusId(undefined);
    setPhase("review");
  }

  const open = Boolean(flow);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto sm:max-w-2xl",
          phase === "review" && "sm:max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{phase === "review" ? "Review import" : "New import"}</DialogTitle>
          <DialogDescription>
            {phase === "review"
              ? "Swipe the stack. Accept posts a transaction; skip leaves it out."
              : "The file stays in this browser. We detect the bank and map columns."}
          </DialogDescription>
        </DialogHeader>

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
          ) : (
            <ReviewDeck
              rows={queue}
              categories={boot.categories}
              rules={boot.rules}
              focusId={focusId}
              onDone={onFinished}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
