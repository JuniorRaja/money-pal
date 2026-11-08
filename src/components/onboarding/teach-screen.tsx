import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { createCategory } from "@/data/mutations";
import type { Category, ImportJobRow } from "@/data/schema";
import { useSession } from "@/components/session";
import { Button } from "@/components/ui/button";
import { categorizeGroupsFn } from "@/lib/categorize.functions";
import {
  magnitudeBucket,
  rankCategoriesForGroup,
  summariseProgress,
  type ReviewGroup,
} from "@/lib/import/group";
import type { CategorizationGroup, CategorizationSuggestion } from "@/lib/import/categorize";
import { formatDay, formatMoney } from "@/lib/money";
import { buildTeachGroups } from "@/lib/import/teach";

export type TeachAssignment = { categoryId: string; categoryName: string };
export type TeachReviewState = {
  groups: ReturnType<typeof buildTeachGroups>;
  assignments: Map<string, TeachAssignment>;
};

export function TeachScreen({
  rows,
  categories,
  aiEnabled,
  initialAssignments,
  onImportAnyway,
  onReviewStateChange,
}: {
  rows: ImportJobRow[];
  categories: Category[];
  aiEnabled: boolean;
  initialAssignments?: Map<string, TeachAssignment>;
  onImportAnyway: () => void;
  onReviewStateChange: (state: TeachReviewState) => void;
}) {
  const { prefs } = useSession();
  const [assignments, setAssignments] = useState<Map<string, TeachAssignment>>(
    () => initialAssignments ?? new Map(),
  );
  const [aiSuggestions, setAiSuggestions] = useState<Map<string, CategorizationSuggestion>>(
    () => new Map(),
  );
  const [extraGroupId, setExtraGroupId] = useState<string | null>(null);
  const [skippedGroups, setSkippedGroups] = useState<Set<string>>(() => new Set());
  const [skippedTrivial, setSkippedTrivial] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [keyboardChoice, setKeyboardChoice] = useState<{
    groupId: string;
    index: number;
  } | null>(null);
  const [dynamicCategories, setDynamicCategories] = useState(() => categories);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const focusGroupId = useRef<string | null>(null);

  const groups = useMemo(() => buildTeachGroups(rows, categories), [categories, rows]);

  const activeGroups = useMemo(
    () => groups.filter((group) => group.band === "needs_input"),
    [groups],
  );
  const unresolvedGroups = useMemo(
    () => activeGroups.filter((group) => !group.suggestedCategoryName),
    [activeGroups],
  );
  const progressGroups = groups.map((group) => {
    const picked = assignments.get(group.id);
    if (!picked) return group;
    return {
      ...group,
      suggestedCategoryName: picked.categoryName,
      confidence: 1,
      band: "settled" as const,
    };
  });
  const progress = summariseProgress(progressGroups);
  useEffect(() => {
    setDynamicCategories(categories);
  }, [categories]);

  useEffect(() => {
    onReviewStateChange({ groups, assignments });
  }, [assignments, groups, onReviewStateChange]);

  useEffect(() => {
    if (groups.length > 0 && activeGroups.length === 0) onImportAnyway();
  }, [activeGroups.length, groups.length, onImportAnyway]);

  useEffect(() => {
    if (!aiEnabled || !prefs.aiCategorization || unresolvedGroups.length === 0) return;
    let cancelled = false;
    const groupIds = new Map<string, string>();
    const inputGroups: CategorizationGroup[] = unresolvedGroups.map((group, index) => {
      const id = `g${index + 1}`;
      groupIds.set(id, group.id);
      return {
        id,
        label: group.label,
        kind: group.keyKind,
        count: group.rowCount,
        direction: group.type,
        cadence: group.recurrence?.cadence ?? null,
        amountStability: group.recurrence?.amountStability ?? null,
        humanRound: group.recurrence?.humanRound ?? null,
        magnitude:
          group.recurrence?.magnitude ?? magnitudeBucket(group.totalPaise, unresolvedGroups),
      };
    });
    void categorizeGroupsFn({ data: { enabled: true, groups: inputGroups } })
      .then(({ suggestions }) => {
        if (cancelled) return;
        setAiSuggestions(
          new Map(
            suggestions.flatMap((suggestion) => {
              const groupId = groupIds.get(suggestion.groupId);
              return groupId ? [[groupId, suggestion] as const] : [];
            }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setAiSuggestions(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [aiEnabled, prefs.aiCategorization, unresolvedGroups]);

  useEffect(() => {
    const next = activeGroups.find(
      (group) => !assignments.has(group.id) && !skippedGroups.has(group.id),
    );
    if (focusGroupId.current && next) {
      cardRefs.current.get(next.id)?.focus();
    }
    focusGroupId.current = null;
  }, [activeGroups, assignments, skippedGroups]);

  useEffect(() => {
    if (!leavingGroupId) return;
    const timer = window.setTimeout(() => setLeavingGroupId(null), 180);
    return () => window.clearTimeout(timer);
  }, [leavingGroupId]);

  const choose = useCallback(
    (groupId: string, categoryId: string, categoryName: string) => {
      const previous = assignments.get(groupId);
      setAssignments((current) => new Map(current).set(groupId, { categoryId, categoryName }));
      setKeyboardChoice(null);
      setLeavingGroupId(groupId);
      focusGroupId.current = groupId;
      toast(`Assigned to ${categoryName}`, {
        duration: 5_000,
        action: {
          label: "Undo",
          onClick: () => {
            setAssignments((current) => {
              const next = new Map(current);
              if (previous) next.set(groupId, previous);
              else next.delete(groupId);
              return next;
            });
          },
        },
      });
    },
    [assignments],
  );

  const chooseAi = useCallback(
    async (
      groupId: string,
      suggestion: CategorizationSuggestion,
      direction: "income" | "expense",
    ) => {
      if (suggestion.categoryId && suggestion.categoryName) {
        choose(groupId, suggestion.categoryId, suggestion.categoryName);
        return;
      }
      if (!suggestion.isNew || !suggestion.categoryName) return;
      const existing = dynamicCategories.find(
        (category) => category.name.toLowerCase() === suggestion.categoryName!.toLowerCase(),
      );
      if (existing) {
        choose(groupId, existing.id, existing.name);
        return;
      }
      try {
        const created = await createCategory({
          name: suggestion.categoryName,
          kind: suggestion.kind ?? (direction === "income" ? "income" : "essentials"),
          icon: "tag",
          color_token: "chart-1",
        });
        const categoryName = suggestion.categoryName;
        setDynamicCategories((previous) => [
          ...previous,
          {
            id: created.id,
            name: categoryName,
            group: suggestion.kind ?? (direction === "income" ? "income" : "essentials"),
            icon: "tag",
            color_token: "chart-1",
          },
        ]);
        choose(groupId, created.id, categoryName);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create category");
      }
    },
    [choose, dynamicCategories],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
        return;
      const current = activeGroups.find(
        (group) => !assignments.has(group.id) && !skippedGroups.has(group.id),
      );
      if (!current) return;
      const choices = chipsFor(current, dynamicCategories, aiSuggestions.get(current.id));
      if (/^[1-4]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (choices[index]) {
          event.preventDefault();
          setKeyboardChoice({ groupId: current.id, index });
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setKeyboardChoice(null);
        setLeavingGroupId(current.id);
        focusGroupId.current = current.id;
        setSkippedGroups((previous) => new Set(previous).add(current.id));
      } else if (event.key === "Enter") {
        const selected = keyboardChoice;
        if (selected?.groupId === current.id) {
          const choice = chipsFor(current, dynamicCategories, aiSuggestions.get(current.id))[
            selected.index
          ];
          event.preventDefault();
          if (choice?.category) choose(current.id, choice.category.id, choice.category.name);
          else if (choice?.suggestion) void chooseAi(current.id, choice.suggestion, current.type);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeGroups,
    aiSuggestions,
    assignments,
    choose,
    chooseAi,
    dynamicCategories,
    keyboardChoice,
    skippedGroups,
  ]);

  const settledGroups = progressGroups.filter((group) => group.band === "settled");
  const settledTotals = new Map<string, number>();
  for (const group of settledGroups) {
    const category = group.suggestedCategoryName ?? "Uncategorised";
    settledTotals.set(category, (settledTotals.get(category) ?? 0) + group.totalPaise);
  }

  return (
    <div className="min-h-[calc(100dvh-120px)] pb-28">
      <section aria-label="Import review" className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Teach your statement</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A choice applies to every payment in that group.
            </p>
          </div>
          <p className="numeric shrink-0 text-sm text-muted-foreground">{groups.length} groups</p>
        </div>

        {settledGroups.length > 0 && (
          <details className="mb-5 border-y border-border py-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span>{settledGroups.length} groups already sorted</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </summary>
            <ul className="mt-2 divide-y divide-border/60" aria-label="Settled categories">
              {[...settledTotals].map(([name, amount]) => (
                <li key={name} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{name}</span>
                  <span className="numeric text-muted-foreground">{formatMoney(amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {activeGroups.length > 0 && (
          <section aria-label="Groups needing input" className="space-y-3">
            {activeGroups
              .filter(
                (group) =>
                  (!assignments.has(group.id) && !skippedGroups.has(group.id)) ||
                  group.id === leavingGroupId,
              )
              .map((group) => {
                const ai = aiSuggestions.get(group.id);
                const choices = chipsFor(group, dynamicCategories, ai);
                return (
                  <article
                    key={group.id}
                    ref={(element) => {
                      if (element) cardRefs.current.set(group.id, element);
                      else cardRefs.current.delete(group.id);
                    }}
                    tabIndex={-1}
                    aria-hidden={group.id === leavingGroupId}
                    className={`rounded-lg border border-border bg-card p-4 outline-none transition-[opacity,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring sm:p-5 ${
                      group.id === leavingGroupId
                        ? "pointer-events-none -translate-y-2 opacity-0"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-foreground">
                          {group.label}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {group.rowCount} {group.rowCount === 1 ? "payment" : "payments"} ·{" "}
                          {formatMoney(group.totalPaise)} ·{" "}
                          {formatDateRange(group.firstDate, group.lastDate)}
                        </p>
                      </div>
                      <p className="numeric shrink-0 text-sm font-medium text-foreground">
                        {group.type === "income" ? "Income" : "Expense"}
                      </p>
                    </div>
                    {group.payees.length > 0 && (
                      <p className="mt-3 break-words text-xs text-muted-foreground">
                        {group.payees.join(" · ")}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {choices.map((choice, index) => (
                        <button
                          key={choice.category?.id ?? choice.suggestion?.groupId ?? choice.label}
                          type="button"
                          onClick={() => {
                            if (choice.category) {
                              choose(group.id, choice.category.id, choice.category.name);
                            } else if (choice.suggestion) {
                              void chooseAi(group.id, choice.suggestion, group.type);
                            }
                          }}
                          aria-pressed={
                            keyboardChoice?.groupId === group.id && keyboardChoice.index === index
                          }
                          className={`min-h-11 rounded-md border px-3 text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            choice.suggestion
                              ? "border-primary/50 bg-primary/10 font-medium"
                              : "border-border"
                          }`}
                          aria-label={`${index + 1}. Categorize ${group.label} as ${choice.label}`}
                        >
                          {keyboardChoice?.groupId === group.id && keyboardChoice.index === index
                            ? `${index + 1} · ${choice.label}`
                            : choice.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setExtraGroupId(extraGroupId === group.id ? null : group.id)}
                        className="min-h-11 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={extraGroupId === group.id}
                      >
                        Other
                      </button>
                    </div>
                    {extraGroupId === group.id && (
                      <label className="mt-3 block">
                        <span className="sr-only">Other categories for {group.label}</span>
                        <select
                          autoFocus
                          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                          defaultValue=""
                          onChange={(event) => {
                            const category = dynamicCategories.find(
                              (item) => item.id === event.target.value,
                            );
                            if (category) choose(group.id, category.id, category.name);
                          }}
                        >
                          <option value="" disabled>
                            Choose a category
                          </option>
                          {dynamicCategories
                            .filter((category) =>
                              group.type === "income"
                                ? category.group === "income" || category.group === "transfer"
                                : category.group !== "income",
                            )
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </article>
                );
              })}
          </section>
        )}

        {groups.filter((group) => group.band === "trivial").length > 0 && !skippedTrivial && (
          <section
            aria-label="Small payments"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3"
          >
            <p className="text-sm text-muted-foreground">
              {groups.filter((group) => group.band === "trivial").length} small payments under ₹200
            </p>
            <Button variant="outline" className="min-h-11" onClick={() => setSkippedTrivial(true)}>
              Skip these {groups.filter((group) => group.band === "trivial").length}
            </Button>
          </section>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {formatMoney(progress.settledPaise)} of {formatMoney(progress.totalPaise)} sorted
              </span>
              <span className="numeric">{progress.pct}%</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Statement value sorted"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.pct}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
          <Button className="min-h-11 shrink-0" onClick={onImportAnyway}>
            Import anyway <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

type TeachChip =
  | { label: string; category: Category; suggestion?: never }
  | { label: string; category: null; suggestion: CategorizationSuggestion };

function chipsFor(
  group: ReviewGroup,
  categories: Category[],
  ai?: CategorizationSuggestion,
): TeachChip[] {
  const ranked = rankedFor(group, categories, ai);
  if (ai?.isNew && ai.categoryName) {
    return [
      ...ranked.slice(0, 3).map((category) => ({ label: category.name, category })),
      { label: `+ ${ai.categoryName}`, category: null, suggestion: ai },
    ];
  }
  return ranked.map((category) => ({
    label: ai?.categoryId === category.id ? `AI · ${category.name}` : category.name,
    category,
  }));
}

function rankedFor(
  group: ReviewGroup,
  categories: Category[],
  ai?: CategorizationSuggestion,
): Category[] {
  const ranked = rankCategoriesForGroup(
    {
      type: group.type,
      recurrence: group.recurrence,
      magnitude: group.recurrence?.magnitude ?? "small",
    },
    categories,
  );
  if (!ai?.categoryId) return ranked;
  const suggested = categories.find((category) => category.id === ai.categoryId);
  return suggested
    ? [suggested, ...ranked.filter((category) => category.id !== suggested.id)].slice(0, 4)
    : ranked;
}

function formatDateRange(first: string, last: string): string {
  return first === last
    ? formatDay(`${first}T12:00:00+05:30`)
    : `${formatDay(`${first}T12:00:00+05:30`)} – ${formatDay(`${last}T12:00:00+05:30`)}`;
}
