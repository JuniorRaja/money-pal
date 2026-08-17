import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  History,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AddRecordDialog } from "@/components/add-record-dialog";
import { AppShell } from "@/components/app-shell";
import {
  ArchiveGoalDialog,
  ContributeGoalDialog,
  EditGoalDialog,
  GoalHistoryDialog,
} from "@/components/goal-dialogs";
import { MaskedText } from "@/components/masked-text";
import { Bar, Panel, Ring, StatCard } from "@/components/mm-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  getAccounts,
  getArchivedGoals,
  getGoalContributions,
  getGoals,
  listTransactions,
} from "@/data/repository";
import type { Account, Goal, GoalContribution, Transaction } from "@/data/schema";
import { formatCompact, formatMoney } from "@/lib/money";
import { monthsUntil } from "@/lib/period";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Money Pal Financial OS" },
      {
        name: "description",
        content: "Track savings goals, monthly contributions and projected finish dates.",
      },
      { property: "og:title", content: "Goals — Money Pal" },
      {
        property: "og:description",
        content: "Name what you're saving for, then watch it get closer.",
      },
    ],
  }),
  loader: async () => {
    const [goals, archivedGoals, accounts, contributions, transactions] = await Promise.all([
      getGoals(),
      getArchivedGoals(),
      getAccounts(),
      getGoalContributions(),
      listTransactions(),
    ]);
    return { goals, archivedGoals, accounts, contributions, transactions };
  },
  component: GoalsPage,
});

function goalPace(g: Goal) {
  const done = g.target > 0 && g.saved >= g.target;
  const remaining = Math.max(0, g.target - g.saved);
  const behindMonth =
    !done && g.monthly_contribution > 0 && g.saved_this_month < g.monthly_contribution;
  let projectedMonths: number | null = null;
  let late = false;
  if (!done && g.monthly_contribution > 0) {
    projectedMonths = Math.max(1, Math.ceil(remaining / g.monthly_contribution));
    if (g.target_date) {
      const until = monthsUntil(g.target_date);
      late = projectedMonths > Math.max(0, until);
    }
  }
  return { done, remaining, behindMonth, late, projectedMonths };
}

function GoalsPage() {
  const { goals, archivedGoals, accounts, contributions, transactions } = Route.useLoaderData() as {
    goals: Goal[];
    archivedGoals: Goal[];
    accounts: Account[];
    contributions: GoalContribution[];
    transactions: Transaction[];
  };
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [archiving, setArchiving] = useState<Goal | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const [historyFor, setHistoryFor] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Combine active and archived goals based on toggle
  const displayGoals = showArchived ? [...goals, ...archivedGoals] : goals;

  // Stats only count active (non-archived) goals
  const target = goals.reduce((s, g) => s + g.target, 0);
  const saved = goals.reduce((s, g) => s + g.saved, 0);
  const monthly = goals.reduce((s, g) => s + g.monthly_contribution, 0);
  const overallPct = target === 0 ? 0 : Math.round((saved / target) * 100);

  const linkedHeaderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of contributions) {
      if (row.transaction_id) ids.add(row.transaction_id);
    }
    return ids;
  }, [contributions]);

  const behind = goals.filter((g) => goalPace(g).behindMonth);
  const late = goals.filter((g) => goalPace(g).late);
  const suggestion = late[0] ?? behind[0] ?? null;

  const historyRows = historyFor ? contributions.filter((c) => c.goal_id === historyFor.id) : [];

  return (
    <AppShell
      title="Goals"
      subtitle="Name what you're saving for, then watch it get closer."
      signature="goals"
      actions={
        <div className="flex items-center gap-4">
          {archivedGoals.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={showArchived}
                onCheckedChange={setShowArchived}
                aria-label="Show archived goals"
              />
              <span className="flex items-center gap-1.5">
                <Archive className="h-3.5 w-3.5" />
                Show archived ({archivedGoals.length})
              </span>
            </label>
          )}
          <button
            type="button"
            data-testid="goal-new"
            onClick={() => setAdding(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-3.5 w-3.5" /> New goal
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          label="Total target"
          value={formatMoney(target, { whole: true })}
          hint={`${goals.length} goal${goals.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Saved so far"
          value={formatMoney(saved, { whole: true })}
          hint={target ? `${overallPct}% of target` : "No targets yet"}
        />
        <StatCard
          label="Monthly plan"
          value={formatMoney(monthly, { whole: true })}
          hint="planned, not automatic"
        />
        <StatCard
          label="Overall progress"
          value={target === 0 ? "—" : `${overallPct}%`}
          hint="across every goal"
        />
      </div>

      {goals.length === 0 && !showArchived ? (
        <div
          className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center"
          data-testid="goal-empty"
        >
          <p className="text-sm text-foreground">No goals yet.</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Name a target, an optional deadline, and a monthly plan. Saved is a running total of
            contributions — it is not taken from your accounts.
          </p>
        </div>
      ) : displayGoals.length === 0 ? (
        <div
          className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center"
          data-testid="goal-empty"
        >
          <p className="text-sm text-foreground">No goals to show.</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {showArchived
              ? "No archived goals found."
              : "Create your first savings goal to get started."}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-5">
          {displayGoals.map((g) => {
            const pct = g.target === 0 ? 0 : (g.saved / g.target) * 100;
            const pace = goalPace(g);
            const account = accounts.find((a) => a.id === g.account_id);
            const isArchived = g.archived === true;
            return (
              <div
                key={g.id}
                className={`card-lift grain rounded-2xl border bg-card p-5 ${isArchived ? "border-dashed border-muted-foreground/50 opacity-70" : "border-border"}`}
                data-testid={`goal-card-${g.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-medium text-foreground">{g.name}</p>
                      {isArchived && (
                        <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          <Archive className="h-2.5 w-2.5" /> Archived
                        </span>
                      )}
                    </div>
                    {g.blurb ? (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {g.blurb}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <Ring value={pct} size={62} label={`${Math.round(pct)}%`} />
                    {!isArchived && (
                      <GoalMenu
                        onContribute={() => setContributing(g)}
                        onHistory={() => setHistoryFor(g)}
                        onEdit={() => setEditing(g)}
                        onArchive={() => setArchiving(g)}
                      />
                    )}
                  </div>
                </div>
                <p className="numeric maskable mt-5 text-2xl text-foreground">
                  <MaskedText>{formatMoney(g.saved, { whole: true })}</MaskedText>
                </p>
                <p className="text-xs text-muted-foreground">of {formatCompact(g.target)} target</p>
                <div className="mt-4">
                  <Bar
                    value={pct}
                    tone={
                      pace.done ? "success" : pace.late || pace.behindMonth ? "warning" : "primary"
                    }
                  />
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" />
                    {g.target_date || "No deadline"}
                  </span>
                  <span className="numeric">
                    {g.monthly_contribution
                      ? `${formatCompact(g.monthly_contribution)}/mo planned`
                      : "No monthly plan"}
                  </span>
                </div>
                {account ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{account.name}</p>
                ) : null}
                <p className="mt-3 rounded-lg bg-accent/50 px-3 py-2 text-[11px] text-muted-foreground">
                  {pace.done
                    ? "This goal is funded."
                    : pace.projectedMonths
                      ? `At this pace you finish in about ${pace.projectedMonths} month${pace.projectedMonths === 1 ? "" : "s"}${pace.late ? " — later than the deadline." : "."}`
                      : "Set a monthly plan to estimate a finish date."}
                  {pace.behindMonth
                    ? ` This month ${formatCompact(g.saved_this_month)} of ${formatCompact(g.monthly_contribution)}.`
                    : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {(late.length > 0 || behind.length > 0) && (
        <Panel className="mt-5" title="Pace">
          <ul className="space-y-3">
            {late.map((g) => (
              <li key={`late-${g.id}`} className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm text-foreground">
                  {g.name} is behind the deadline at the current monthly plan.
                </p>
              </li>
            ))}
            {behind
              .filter((g) => !late.some((l) => l.id === g.id))
              .map((g) => (
                <li key={`month-${g.id}`} className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-sm text-foreground">
                    {g.name} is under this month’s plan ({formatCompact(g.saved_this_month)} of{" "}
                    {formatCompact(g.monthly_contribution)}).
                  </p>
                </li>
              ))}
          </ul>
        </Panel>
      )}

      {suggestion ? (
        <Panel className="mt-5" title="Suggestion from Money Pal">
          <p className="text-sm leading-relaxed text-foreground">
            {goalPace(suggestion).late
              ? `Raising the monthly plan on ${suggestion.name} would pull the projected finish back toward ${suggestion.target_date}.`
              : `${suggestion.name} is under this month’s planned contribution. A manual add will catch it up — nothing is transferred automatically.`}
          </p>
        </Panel>
      ) : null}

      <AddRecordDialog kind={adding ? "goal" : null} onOpenChange={(open) => setAdding(open)} />
      <EditGoalDialog
        goal={editing}
        accounts={accounts}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <ArchiveGoalDialog
        goal={archiving}
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(null)}
      />
      <ContributeGoalDialog
        goal={contributing}
        transactions={transactions}
        linkedHeaderIds={linkedHeaderIds}
        open={Boolean(contributing)}
        onOpenChange={(open) => !open && setContributing(null)}
      />
      <GoalHistoryDialog
        goal={historyFor}
        rows={historyRows}
        transactions={transactions}
        linkedHeaderIds={linkedHeaderIds}
        open={Boolean(historyFor)}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />
    </AppShell>
  );
}

function GoalMenu({
  onContribute,
  onHistory,
  onEdit,
  onArchive,
}: {
  onContribute: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Goal actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onContribute} className="gap-2">
          <PiggyBank className="h-3.5 w-3.5" /> Contribute
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onHistory} className="gap-2">
          <History className="h-3.5 w-3.5" /> History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit} className="gap-2">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onArchive}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
