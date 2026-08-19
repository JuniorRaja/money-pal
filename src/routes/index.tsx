import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-guard";
import {
  ArrowUpRight,
  CalendarClock,
  Landmark,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { MaskedText } from "@/components/masked-text";
import { Bar, EmptyState, Panel, Ring, StatCard, TableEmptyState } from "@/components/mm-ui";
import { OverviewSkeleton } from "@/components/route-skeletons";
import {
  getAccounts,
  getBudgets,
  getCategories,
  getCreditCardCycles,
  getGoals,
  getMonthlyRollups,
  getSlices,
  getTimelineEvents,
  listTransactions,
  allocationFor,
  isSliceable,
  summariseCashflow,
  summariseNetWorth,
  summariseOwnership,
} from "@/data/repository";
import type {
  Account,
  BudgetPeriod,
  Category,
  CreditCardCycle,
  Goal,
  MonthlyRollup,
  Slice,
  TimelineEvent,
  Transaction,
} from "@/data/schema";
import { ACCOUNT_KINDS, NET_WORTH_KINDS } from "@/data/schema";
import { balanceChange, balanceHint, monthWindows, pctChange, windowLabel } from "@/lib/compare";
import { dayKey, formatCompact, formatDay, formatMoney, formatPct } from "@/lib/money";
import { dueLabel, upcomingBills } from "@/lib/timeline";

/** How far ahead the Overview panel looks — the timeline itself only alerts at 5 days. */
const UPCOMING_BILL_DAYS = 30;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Money Pal Financial OS" },
      {
        name: "description",
        content:
          "Net worth, cash flow, budgets and upcoming bills at a glance in the Money Pal overview.",
      },
      { property: "og:title", content: "Overview — Money Pal Financial OS" },
      {
        property: "og:description",
        content: "Your net worth, this month's cash flow and what needs attention today.",
      },
    ],
  }),
  beforeLoad: requireAuth,
  loader: async () => {
    const [accounts, transactions, rollups, budgets, goals, events, categories, cycles] =
      await Promise.all([
        getAccounts(),
        // Unfiltered: the month-over-month panel needs last month's entries too,
        // and `listTransactions` filters in memory anyway — no extra round trip.
        listTransactions(),
        getMonthlyRollups(),
        getBudgets(),
        getGoals(),
        getTimelineEvents(),
        getCategories(),
        getCreditCardCycles(),
      ]);
    const slices = await getSlices();
    return { accounts, transactions, rollups, budgets, goals, events, categories, slices, cycles };
  },
  pendingComponent: OverviewSkeleton,
  pendingMs: 200,
  pendingMinMs: 500,
  component: OverviewPage,
});

function OverviewPage() {
  const { accounts, transactions, rollups, budgets, goals, events, categories, slices, cycles } =
    Route.useLoaderData() as {
      accounts: Account[];
      transactions: Transaction[];
      rollups: MonthlyRollup[];
      budgets: BudgetPeriod[];
      goals: Goal[];
      events: TimelineEvent[];
      categories: Category[];
      slices: Slice[];
      cycles: CreditCardCycle[];
    };
  const bills = upcomingBills(
    cycles,
    accounts,
    dayKey(new Date().toISOString()),
    UPCOMING_BILL_DAYS,
  );
  const nw = summariseNetWorth(accounts);
  const ownership = summariseOwnership(
    accounts,
    accounts.filter((a) => isSliceable(a.kind)).map((a) => allocationFor(a, slices)),
  );
  // This month so far, against the same run of days last month — comparing a
  // part month to a whole one would read as a crash every 1st.
  const windows = monthWindows(transactions);
  const cf = summariseCashflow(windows.current);
  const priorCf = summariseCashflow(windows.prior);
  const priorLabel = windowLabel(windows.priorPeriod, windows.priorThroughDay);
  const incomeDelta = pctChange(cf.income, priorCf.income);
  const expenseDelta = pctChange(cf.expense, priorCf.expense);
  const netDelta = pctChange(cf.net, priorCf.net);

  // Balance history comes from the ledger back-cast the sparklines already use,
  // so these deltas and the account cards can never disagree.
  const quarter = balanceChange(accounts, ACCOUNT_KINDS, { months: 3 });
  const cashDelta = balanceChange(accounts, NET_WORTH_KINDS.cash);
  const investmentDelta = balanceChange(accounts, NET_WORTH_KINDS.investments);
  const liabilityDelta = balanceChange(accounts, NET_WORTH_KINDS.liabilities, { magnitude: true });

  const planned = budgets.reduce((s, b) => s + b.planned, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);

  const chart = rollups.map((r) => ({
    month: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${r.period}-01`)),
    income: r.income / 100,
    expense: r.expense / 100,
  }));

  const insight =
    expenseDelta !== null
      ? `Spending is ${expenseDelta < 0 ? "lower" : expenseDelta > 0 ? "higher" : "level with"} than the same stretch of last month — ${formatCompact(cf.expense)} so far against ${formatCompact(priorCf.expense)} over ${priorLabel}.`
      : cf.count > 0
        ? `${cf.count} entr${cf.count === 1 ? "y" : "ies"} recorded this month. Comparisons appear here once there is a month behind them.`
        : "Nothing recorded this month yet. Import a statement and the numbers here fill themselves in.";

  return (
    <AppShell
      title="Overview"
      subtitle="Everything in one calm view, as of this morning."
      signature="overview"
    >
      <div className="grid grid-cols-12 gap-5">
        <Panel
          className="col-span-8"
          title="Net worth"
          action={
            quarter?.pct != null && (
              // Measured across every account. Custodial money has no stored
              // history, so the delta covers the full balance, not the owned figure.
              <span
                className="flex items-center gap-1.5 text-xs"
                title="Change in total balance across all accounts over the past three months"
              >
                <span
                  className={`numeric ${quarter.pct >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {formatPct(quarter.pct)}
                </span>
                <span className="text-muted-foreground">past 3 months</span>
              </span>
            )
          }
        >
          <div>
            <p className="numeric maskable text-[46px] leading-none text-foreground">
              <MaskedText>{formatMoney(ownership.owned, { whole: true })}</MaskedText>
            </p>
            {accounts.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No accounts yet.{" "}
                <Link to="/accounts" className="text-primary">
                  Add your first one
                </Link>{" "}
                and this fills in.
              </p>
            ) : (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cash {formatCompact(nw.cash)} · Investments {formatCompact(nw.investments)} ·
                  Liabilities {formatCompact(nw.liabilities)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Truly yours. {formatCompact(ownership.custodial)} held for others is out of this
                  figure; {formatCompact(ownership.earmarked)} is earmarked.
                </p>
              </>
            )}
          </div>
          {chart.length === 0 ? (
            <div className="mt-6 flex h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
              <p className="text-sm text-foreground">No cash flow to chart yet.</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Income and expenses appear here month by month as soon as your first transactions
                land.
              </p>
              <Link
                to="/imports"
                className="mt-4 rounded-lg border border-border px-3 py-1.5 text-xs text-primary transition-colors hover:bg-accent"
              >
                Import a statement
              </Link>
            </div>
          ) : (
            <div className="mt-6 h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: -18, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number | string) => `\u20B9${Number(v).toLocaleString("en-IN")}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="var(--color-success)"
                    fill="url(#inc)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="var(--color-primary)"
                    fill="url(#exp)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <div className="col-span-4 grid gap-5">
          <StatCard
            label="Available cash"
            value={formatMoney(nw.cash, { whole: true })}
            delta={cashDelta?.pct}
            hint={balanceHint(cashDelta)}
            icon={<Wallet className="h-4 w-4" />}
            className="pattern-arcs"
          />
          <StatCard
            label="Investments"
            value={formatMoney(nw.investments, { whole: true })}
            delta={investmentDelta?.pct}
            hint={balanceHint(investmentDelta)}
            icon={<TrendingUp className="h-4 w-4" />}
            className="pattern-hatch"
          />
          <StatCard
            label="Liabilities"
            value={formatMoney(nw.liabilities, { whole: true })}
            delta={liabilityDelta?.pct}
            deltaTone="down-good"
            hint={balanceHint(liabilityDelta)}
            icon={<Landmark className="h-4 w-4" />}
            className="pattern-steps"
          />
        </div>

        <Panel
          className="col-span-4"
          title="This month"
          action={
            <span className="text-xs text-muted-foreground">
              {priorCf.count > 0 ? `vs ${priorLabel}` : `1–${windows.throughDay}`}
            </span>
          }
        >
          <div className="space-y-4">
            <Row label="Income" value={formatMoney(cf.income)} tone="success" delta={incomeDelta} />
            <Row
              label="Expenses"
              value={formatMoney(cf.expense)}
              tone="destructive"
              delta={expenseDelta}
              deltaTone="down-good"
            />
            <Row
              label="Net cash flow"
              value={formatMoney(cf.net)}
              tone="foreground"
              delta={netDelta}
            />
            <div className="pt-2">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Budget used</span>
                <span className="numeric">
                  {planned === 0 ? "—" : `${Math.round((spent / planned) * 100)}%`}
                </span>
              </div>
              <Bar value={planned === 0 ? 0 : (spent / planned) * 100} tone="primary" />
            </div>
          </div>
        </Panel>

        <Panel
          className="col-span-4"
          title="Goals in motion"
          action={
            goals.length > 0 ? (
              <Link to="/goals" className="text-xs text-primary">
                View all
              </Link>
            ) : undefined
          }
        >
          {goals.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="h-5 w-5" />}
              title="No savings goals yet."
              description="Set a target, add a deadline, and watch your progress grow."
              linkTo="/goals"
              linkLabel="Create your first goal"
              compact
            />
          ) : (
            <ul className="space-y-4">
              {goals.slice(0, 3).map((g) => {
                const pct = g.target === 0 ? 0 : (g.saved / g.target) * 100;
                return (
                  <li key={g.id} className="flex items-center gap-4">
                    <Ring value={pct} label={`${Math.round(pct)}%`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{g.name}</p>
                      <p className="numeric text-xs text-muted-foreground">
                        {formatCompact(g.saved)} of {formatCompact(g.target)}
                      </p>
                    </div>
                    <PiggyBank className="h-4 w-4 text-muted-foreground" />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="col-span-4 grid gap-5">
          <Panel title="This month's insight" bodyClassName="p-5">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm leading-relaxed text-foreground">{insight}</p>
                <Link
                  to="/assistant"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
                >
                  Ask about it <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </Panel>
          <Panel
            title="Upcoming bills"
            action={
              bills.length ? (
                <Link to="/accounts" className="text-xs text-primary">
                  Cards
                </Link>
              ) : undefined
            }
          >
            {bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <p className="mt-2 text-sm text-foreground">No upcoming bills yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Card due dates will show up here once cycles are tracked.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {bills.slice(0, 4).map((bill) => (
                  <li key={bill.cycle.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {bill.account?.name ?? "Card"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due {dueLabel(bill.due_in_days)} · min{" "}
                        {formatCompact(bill.cycle.minimum_due)}
                      </p>
                    </div>
                    <span className="numeric shrink-0 text-sm text-foreground">
                      {formatMoney(bill.outstanding, { whole: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          className="col-span-8"
          title="Recent activity"
          action={
            transactions.length > 0 ? (
              <Link to="/transactions" className="text-xs text-primary">
                All transactions
              </Link>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          <table className="w-full text-sm">
            <tbody>
              {transactions.length === 0 ? (
                <TableEmptyState
                  colSpan={4}
                  icon={<Receipt className="h-5 w-5" />}
                  title="No transactions yet."
                  description="Import a statement or add your first transaction to see activity here."
                />
              ) : (
                transactions.slice(0, 7).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {formatDay(t.occurred_at)}
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-foreground">{t.merchant}</p>
                      <p className="text-xs text-muted-foreground">{t.descriptor}</p>
                    </td>
                    <td className="px-2 py-3 text-xs text-muted-foreground">
                      {categories.find((c) => c.id === t.category_id)?.name}
                    </td>
                    <td
                      className={`numeric px-5 py-3 text-right ${t.amount > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {formatMoney(t.amount, { sign: true })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>

        <Panel
          className="col-span-4"
          title="Latest signals"
          action={
            <Link to="/timeline" className="text-xs text-primary">
              Timeline
            </Link>
          }
        >
          <ul className="space-y-4">
            {events.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Nothing to flag yet — signals appear as your ledger fills up.
              </li>
            )}
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                <div>
                  <p className="text-sm text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  value,
  tone,
  delta,
  deltaTone = "up-good",
}: {
  label: string;
  value: string;
  tone: string;
  /** Null when last month has nothing to compare against — the column stays empty. */
  delta?: number | null;
  deltaTone?: "up-good" | "down-good";
}) {
  const good = delta == null ? false : deltaTone === "down-good" ? delta < 0 : delta > 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        {delta != null && (
          <span
            className={`numeric text-xs ${delta === 0 ? "text-muted-foreground" : good ? "text-success" : "text-destructive"
              }`}
          >
            {formatPct(delta)}
          </span>
        )}
        <span className={`numeric text-sm text-${tone}`}>{value}</span>
      </span>
    </div>
  );
}
