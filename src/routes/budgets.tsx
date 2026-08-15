import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutTemplate,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";

import { AddRecordDialog } from "@/components/add-record-dialog";
import { AppShell } from "@/components/app-shell";
import {
  ApplyBudgetTemplateDialog,
  ArchiveBudgetLineDialog,
  EditBudgetLineDialog,
} from "@/components/budget-dialogs";
import { Bar, Panel, StatCard } from "@/components/mm-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyBudgetFromPrevious } from "@/data/mutations";
import { getBudgets, getCategories, getCategorySpend } from "@/data/repository";
import type { BudgetPeriod, Category, CategorySpend } from "@/data/schema";
import { formatMoney } from "@/lib/money";
import { currentPeriod, formatPeriodLabel, periodPace, shiftPeriod } from "@/lib/period";

type BudgetsSearch = { period?: string };

function parsePeriod(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : undefined;
}

export const Route = createFileRoute("/budgets")({
  validateSearch: (search: Record<string, unknown>): BudgetsSearch => {
    const period = parsePeriod(search["period"]);
    return period ? { period } : {};
  },
  loaderDeps: ({ search }: { search: BudgetsSearch }) => ({
    period: search.period ?? currentPeriod(),
  }),
  loader: async ({ deps }) => {
    const period = deps.period;
    const [budgets, categories, spend] = await Promise.all([
      getBudgets(period),
      getCategories(),
      getCategorySpend(period),
    ]);
    return { budgets, categories, spend, period };
  },
  head: () => ({
    meta: [
      { title: "Budgets — Money Pal Financial OS" },
      {
        name: "description",
        content: "Plan every category, watch the pace, and get warned before a budget slips.",
      },
      { property: "og:title", content: "Budgets — Money Pal" },
      {
        property: "og:description",
        content: "Give every rupee a job before the month spends it for you.",
      },
    ],
  }),
  component: BudgetsPage,
});

const slices = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-destructive)",
  "var(--color-muted-foreground)",
];

function BudgetsPage() {
  const navigate = useNavigate({ from: "/budgets" });
  const router = useRouter();
  const { budgets, categories, spend, period } = Route.useLoaderData() as {
    budgets: BudgetPeriod[];
    categories: Category[];
    spend: CategorySpend[];
    period: string;
  };
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BudgetPeriod | null>(null);
  const [removing, setRemoving] = useState<BudgetPeriod | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const planned = budgets.reduce((s, b) => s + b.planned, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);
  const overspent = budgets.filter((b) => b.spent > b.planned && b.planned > 0);
  const pace = periodPace(period);
  const usedPct = planned === 0 ? 0 : (spent / planned) * 100;

  const ahead = budgets.filter((b) => {
    if (b.planned <= 0) return false;
    if (b.spent > b.planned) return false;
    const usedBps = Math.round((b.spent / b.planned) * 10000);
    return usedBps > pace.expectedBps && pace.expectedBps < 10000;
  });

  const alerts = overspent.length ? overspent : ahead;

  const pie = budgets
    .filter((b) => b.spent > 0)
    .map((b) => ({ name: nameOf(b.category_id), value: b.spent / 100 }));

  const budgetedIds = new Set(budgets.map((b) => b.category_id));
  const unbudgeted = spend.filter((row) => row.spent > 0 && !budgetedIds.has(row.category_id));

  const remainingHint = useMemo(() => {
    if (pace.isPast) return "Month closed";
    if (pace.isFuture) return "Month has not started";
    if (pace.remainingDays === 1) return "1 day left";
    return `${pace.remainingDays} days left`;
  }, [pace]);

  const go = (next: string) => {
    void navigate({
      search: next === currentPeriod() ? {} : { period: next },
    });
  };

  const copyLast = async () => {
    setCopying(true);
    try {
      const result = await copyBudgetFromPrevious(period);
      if (result.reason === "none" || result.reason === "empty") {
        toast("Nothing to copy", {
          description: `No budget lines in ${formatPeriodLabel(shiftPeriod(period, -1))}.`,
          duration: 4000,
        });
      } else if (result.copied === 0) {
        toast("Already planned", {
          description: "Every category from last month already has a line this month.",
          duration: 4000,
        });
      } else {
        toast.success(
          `Copied ${result.copied} categor${result.copied === 1 ? "y" : "ies"} from last month`,
          result.skipped
            ? { description: `${result.skipped} already existed and were skipped.` }
            : undefined,
        );
        void router.invalidate();
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not copy last month");
    } finally {
      setCopying(false);
    }
  };

  return (
    <AppShell
      title="Budgets"
      subtitle="Give every rupee a job before the month spends it for you."
      signature="budgets"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              aria-label="Previous month"
              data-testid="budget-month-prev"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => go(shiftPeriod(period, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              className="min-w-[9.5rem] text-center text-sm font-medium text-foreground"
              data-testid="budget-month-label"
            >
              {formatPeriodLabel(period)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              data-testid="budget-month-next"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => go(shiftPeriod(period, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            data-testid="budget-copy-last"
            disabled={copying}
            onClick={() => void copyLast()}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" /> Copy last month
          </button>
          <button
            type="button"
            data-testid="budget-apply-template"
            onClick={() => setTemplateOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <LayoutTemplate className="h-3.5 w-3.5" /> 50/30/20
          </button>
          <button
            type="button"
            data-testid="budget-new"
            onClick={() => setAdding(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-3.5 w-3.5" /> New budget
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          label="Planned"
          value={formatMoney(planned, { whole: true })}
          hint={formatPeriodLabel(period)}
        />
        <StatCard
          label="Spent so far"
          value={formatMoney(spent, { whole: true })}
          hint={planned ? `${Math.round(usedPct)}% of plan` : "No plan yet"}
        />
        <StatCard
          label="Remaining"
          value={formatMoney(planned - spent, { whole: true })}
          hint={remainingHint}
        />
        <StatCard
          label="Categories over"
          value={String(overspent.length)}
          hint={ahead.length ? `${ahead.length} ahead of pace` : "need attention"}
        />
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <Panel
          className="col-span-8"
          title="Category pacing"
          action={
            budgets.length ? (
              <span className="text-xs text-muted-foreground">{budgets.length} lines</span>
            ) : null
          }
        >
          {budgets.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center"
              data-testid="budget-empty"
            >
              <p className="text-sm text-foreground">
                No categories planned for {formatPeriodLabel(period)}.
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Add a line, copy last month, or apply the 50/30/20 template. Spent is never stored —
                it follows the ledger.
              </p>
            </div>
          ) : (
            <ul className="space-y-5">
              {budgets.map((b) => {
                const pct = b.planned === 0 ? (b.spent > 0 ? 100 : 0) : (b.spent / b.planned) * 100;
                const over = b.planned > 0 && b.spent > b.planned;
                const usedBps = b.planned === 0 ? 0 : Math.round((b.spent / b.planned) * 10000);
                const fast = !over && usedBps > pace.expectedBps && pace.expectedBps < 10000;
                return (
                  <li key={b.id} data-testid={`budget-line-${b.category_id}`}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground">{nameOf(b.category_id)}</span>
                      <div className="flex items-center gap-2">
                        <span className="numeric text-muted-foreground">
                          {formatMoney(b.spent)} <span className="text-border">/</span>{" "}
                          {formatMoney(b.planned)}
                        </span>
                        <LineMenu onEdit={() => setEditing(b)} onRemove={() => setRemoving(b)} />
                      </div>
                    </div>
                    <Bar
                      value={pct}
                      tone={over ? "destructive" : fast || pct > 85 ? "warning" : "primary"}
                    />
                    <p
                      className={`mt-1 text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {over
                        ? `Over by ${formatMoney(b.spent - b.planned)}`
                        : fast
                          ? `${formatMoney(b.planned - b.spent)} left · ${Math.round(pct)}% used, ahead of pace`
                          : `${formatMoney(b.planned - b.spent)} left · ${Math.round(pct)}% used`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="col-span-4 space-y-5">
          <Panel title="Where it went">
            {pie.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No spending in this month yet.
              </p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pie}
                      dataKey="value"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {pie.map((_, i) => (
                        <Cell key={i} fill={slices[i % slices.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v: number | string) =>
                        `\u20B9${Number(v).toLocaleString("en-IN")}`
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Alerts">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No overspend or pace warnings this month.
              </p>
            ) : (
              <ul className="space-y-3">
                {alerts.map((b) => (
                  <li
                    key={b.id}
                    className="flex gap-3 rounded-xl border border-border bg-accent/40 p-3"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <p className="text-sm text-foreground">{nameOf(b.category_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.spent > b.planned
                          ? `Over budget by ${formatMoney(b.spent - b.planned)}.`
                          : `Pacing at ${Math.round((b.spent / b.planned) * 100)}% with ${pace.remainingDays} day${pace.remainingDays === 1 ? "" : "s"} left.`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {unbudgeted.length > 0 && (
            <Panel title="Unbudgeted spend">
              <ul className="space-y-2" data-testid="budget-unbudgeted">
                {unbudgeted.map((row) => (
                  <li key={row.category_id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{nameOf(row.category_id)}</span>
                    <span className="numeric text-muted-foreground">{formatMoney(row.spent)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <AddRecordDialog
        kind={adding ? "budget" : null}
        onOpenChange={(open) => setAdding(open)}
        defaultPeriod={period}
      />
      <EditBudgetLineDialog
        line={editing}
        categoryName={editing ? nameOf(editing.category_id) : ""}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <ArchiveBudgetLineDialog
        line={removing}
        categoryName={removing ? nameOf(removing.category_id) : ""}
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
      <ApplyBudgetTemplateDialog
        period={period}
        open={templateOpen}
        onOpenChange={setTemplateOpen}
      />
    </AppShell>
  );
}

function LineMenu({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Budget line actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onEdit} className="gap-2">
          <Pencil className="h-3.5 w-3.5" /> Edit planned
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onRemove}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
