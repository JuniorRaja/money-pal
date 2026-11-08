import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { ImportWizard } from "@/components/import/import-wizard";
import {
  TeachScreen,
  type TeachAssignment,
  type TeachReviewState,
} from "@/components/onboarding/teach-screen";
import { Button } from "@/components/ui/button";
import { bulkCommitImportRows } from "@/data/mutations";
import { getCategories, getImportJobRows, getImportRules, getSettings } from "@/data/repository";
import type { Account, AccountKind, ImportJobRow } from "@/data/schema";
import { useSession } from "@/components/session";
import { matchFieldForGroup } from "@/lib/import/group";
import { buildTeachGroups } from "@/lib/import/teach";
import {
  ONBOARDING_STORAGE_KEY,
  readOnboardingProgress,
  type OnboardingProgress,
  type OnboardingStep,
} from "@/lib/onboarding";
import { formatDay, formatMoney } from "@/lib/money";
import { requireAuth } from "@/lib/auth-guard";

const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
];

const STEPS: OnboardingStep[] = ["account", "upload", "teach", "done"];
const EMPTY_IMPORT_ROWS: ImportJobRow[] = [];

export const Route = createFileRoute("/onboarding")({
  beforeLoad: requireAuth,
  loader: async () => {
    const [categories, rules, settings] = await Promise.all([
      getCategories(),
      getImportRules(),
      getSettings(),
    ]);
    return { categories, rules, aiCategorization: settings.ai_categorization };
  },
  head: () => ({ meta: [{ title: "Get started — Money Mate" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { categories, rules, aiCategorization } = Route.useLoaderData();
  const { user, prefs } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const progressRef = useRef<OnboardingProgress | null>(null);
  const [reviewState, setReviewState] = useState<TeachReviewState>({
    groups: [],
    assignments: new Map(),
  });
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const saved = readOnboardingProgress(user.id) ?? { userId: user.id, step: "account" as const };
    progressRef.current = saved;
    setProgress(saved);
  }, [user?.id]);

  const saveProgress = useCallback(
    (patch: Partial<OnboardingProgress>) => {
      if (!user?.id) return;
      const next: OnboardingProgress = {
        ...(progressRef.current ?? { userId: user.id, step: "account" as const }),
        ...patch,
        userId: user.id,
      };
      progressRef.current = next;
      setProgress(next);
      try {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
      } catch {
        toast.error("Onboarding progress could not be saved in this browser.");
      }
    },
    [user?.id],
  );

  const jobQuery = useQuery({
    queryKey: ["onboarding-job", progress?.jobId],
    queryFn: () => getImportJobRows(progress!.jobId!),
    enabled: Boolean(progress?.jobId && (progress.step === "teach" || progress.step === "done")),
  });
  const allRows = jobQuery.data ?? EMPTY_IMPORT_ROWS;
  const openRows = useMemo(
    () => allRows.filter((row) => row.status === "pending" || row.status === "held"),
    [allRows],
  );
  const teachGroups = useMemo(() => buildTeachGroups(openRows, categories), [categories, openRows]);
  const step = progress?.step ?? "account";
  const stepIndex = STEPS.indexOf(step);
  const assignments = useMemo(
    () =>
      new Map(
        teachGroups.flatMap((group, index) => {
          const assignment = progress?.assignments?.[`g${index + 1}`];
          return assignment ? [[group.id, assignment] as const] : [];
        }),
      ),
    [progress?.assignments, teachGroups],
  );

  useEffect(() => {
    if (
      progress?.step === "teach" &&
      progress.jobId &&
      !jobQuery.isPending &&
      !jobQuery.isError &&
      allRows.length > 0 &&
      openRows.length === 0
    ) {
      saveProgress({ step: "done", committed: true });
    }
  }, [
    allRows.length,
    jobQuery.isError,
    jobQuery.isPending,
    openRows.length,
    progress,
    saveProgress,
  ]);

  const onCreated = useCallback(
    (account: Account) => {
      saveProgress({
        accountId: account.id,
        accountKind: account.kind,
      });
      queryClient.setQueryData<Account[]>(["onboarding-accounts", user?.id], (current) =>
        current?.length ? current : [account],
      );
    },
    [queryClient, saveProgress, user?.id],
  );

  const onReviewStateChange = useCallback(
    (state: TeachReviewState) => {
      setReviewState(state);
      saveProgress({
        assignments: Object.fromEntries(
          state.groups.flatMap((group, index) => {
            const assignment = state.assignments.get(group.id);
            return assignment ? [[`g${index + 1}`, assignment]] : [];
          }),
        ),
      });
    },
    [saveProgress],
  );

  const onImportAnyway = useCallback(() => {
    saveProgress({ step: "done" });
  }, [saveProgress]);

  async function commitStatement() {
    if (!progress?.accountId || jobQuery.isPending || jobQuery.isError) return;
    setCommitting(true);
    try {
      const groups = reviewState.groups.length
        ? reviewState.groups
        : buildTeachGroups(openRows, categories);
      const picked = new Map(
        groups.flatMap((group, index) => {
          const assignment = progress.assignments?.[`g${index + 1}`];
          return assignment ? [[group.id, assignment] as const] : [];
        }),
      );
      const categoryForGroup = new Map<string, string>();
      for (const group of groups) {
        const assignment = picked.get(group.id);
        const suggested = group.suggestedCategoryName
          ? categories.find((category) => category.name === group.suggestedCategoryName)?.id
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
        return [
          {
            pattern: group.key,
            category_id,
            account_id: progress.accountId,
            match_field: matchFieldForGroup(group),
          },
        ];
      });
      if (rows.length) await bulkCommitImportRows({ rows, rules });
      saveProgress({ step: "done", committed: true });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-job", progress.jobId] });
      toast.success("Statement imported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this statement");
    } finally {
      setCommitting(false);
    }
  }

  function finish() {
    try {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {
      // The completed account is still accessible even if browser storage is unavailable.
    }
    void navigate({ to: "/", replace: true });
  }

  if (!progress) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="sr-only">Loading onboarding</span>
      </div>
    );
  }

  const rowsWithDates = allRows.filter((row) => row.occurred_at);
  const dates = rowsWithDates.map((row) => row.occurred_at).sort();
  const dateRange = dates.length
    ? `${formatDay(dates[0]!)}${dates.length > 1 ? ` – ${formatDay(dates.at(-1)!)}` : ""}`
    : "No dates";
  const accountName = progress.accountName || "Your account";
  const accountKind = progress.accountKind ?? "bank";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/70 bg-gradient-to-b from-accent/50 to-background px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <span className="text-base font-semibold text-foreground">Money Mate</span>
          <p className="text-xs text-muted-foreground">Your first statement</p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-8 pt-6 sm:px-8 sm:pt-10">
        <nav aria-label="Onboarding progress" className="mb-8">
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map((item, index) => (
              <li key={item} aria-current={index === stepIndex ? "step" : undefined}>
                <div
                  className={`h-1 rounded-full ${index <= stepIndex ? "bg-primary" : "bg-muted"}`}
                />
                <p
                  className={`mt-2 text-xs capitalize ${index <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {item}
                </p>
              </li>
            ))}
          </ol>
        </nav>

        {step === "account" && (
          <section aria-labelledby="account-heading" className="mx-auto max-w-xl">
            <h1 id="account-heading" className="text-3xl font-semibold">
              Start with one account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Name the real account this statement belongs to. We will read its starting balance
              from the statement when available.
            </p>
            <form
              className="mt-7 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!progress.accountName?.trim()) return;
                saveProgress({ step: "upload", accountName: progress.accountName.trim() });
              }}
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Account name</span>
                <input
                  autoFocus
                  required
                  maxLength={60}
                  value={progress.accountName ?? ""}
                  onChange={(event) => saveProgress({ accountName: event.target.value })}
                  placeholder="Everyday savings"
                  className="h-12 w-full rounded-md border border-border bg-card px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Account type</legend>
                <div className="grid grid-cols-3 gap-2">
                  {ACCOUNT_KINDS.map((kind) => (
                    <button
                      key={kind.value}
                      type="button"
                      aria-pressed={accountKind === kind.value}
                      onClick={() => saveProgress({ accountKind: kind.value })}
                      className={`min-h-12 rounded-md border px-3 text-sm transition-colors ${
                        accountKind === kind.value
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {kind.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" size="lg" className="min-h-12 w-full">
                Continue <ArrowRight />
              </Button>
            </form>
          </section>
        )}

        {step === "upload" && progress.accountName && (
          <section aria-labelledby="upload-heading" className="mx-auto max-w-2xl">
            <h1 id="upload-heading" className="text-3xl font-semibold">
              Add a statement
            </h1>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              {accountName} ·{" "}
              {ACCOUNT_KINDS.find((kind) => kind.value === accountKind)?.label ?? "Bank"}
            </p>
            <ImportWizard
              accounts={[]}
              sources={[]}
              profiles={[]}
              categories={categories}
              rules={rules}
              onboardingAccount={{
                name: progress.accountName,
                institution: progress.accountName,
                kind: accountKind,
              }}
              onboardingAccountId={progress.accountId ?? null}
              onAccountCreated={onCreated}
              onStaged={(result) => saveProgress({ step: "teach", jobId: result.job_id })}
            />
          </section>
        )}

        {step === "teach" && progress.jobId && (
          <section aria-label="Teach your statement">
            {jobQuery.isPending ? (
              <div
                className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading staged payments…
              </div>
            ) : jobQuery.isError ? (
              <div className="py-10 text-center">
                <p className="text-sm text-destructive">Could not load this statement.</p>
                <Button
                  className="mt-4 min-h-11"
                  variant="outline"
                  onClick={() => void jobQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-5 text-sm text-muted-foreground">
                  {openRows.length} payments · {dateRange}
                </p>
                <TeachScreen
                  rows={openRows}
                  categories={categories}
                  aiEnabled={prefs.aiCategorization}
                  initialAssignments={assignments}
                  onImportAnyway={onImportAnyway}
                  onReviewStateChange={onReviewStateChange}
                />
              </>
            )}
          </section>
        )}

        {step === "done" && (
          <section aria-labelledby="done-heading" className="mx-auto max-w-xl">
            <h1 id="done-heading" className="text-3xl font-semibold">
              {progress.committed ? "Your money is in view" : "Ready to import"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {accountName} · {allRows.length} payments · {dateRange}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Starting balance inferred from the statement when available.
            </p>
            <p className="mt-8 border-y border-border py-5 text-lg font-medium">
              Next month&apos;s statement will mostly sort itself.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {!progress.committed && (
                <Button
                  variant="outline"
                  className="min-h-12"
                  onClick={() => saveProgress({ step: "teach" })}
                >
                  <ArrowLeft /> Back to groups
                </Button>
              )}
              <Button
                className="min-h-12"
                disabled={
                  committing || (!progress.committed && (jobQuery.isPending || jobQuery.isError))
                }
                onClick={progress.committed ? finish : () => void commitStatement()}
              >
                {committing
                  ? "Importing…"
                  : progress.committed
                    ? "Open dashboard"
                    : `Import ${allRows.length} payments`}
                {progress.committed ? <Check /> : <ArrowRight />}
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
