import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarClock,
  Landmark,
  PiggyBank,
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
import { Bar, Panel, Ring, StatCard } from "@/components/mm-ui";
import {
  CURRENT_PERIOD,
  getAccounts,
  getBudgets,
  getCategories,
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
  Goal,
  MonthlyRollup,
  Slice,
  TimelineEvent,
  Transaction,
} from "@/data/schema";
import { formatCompact, formatDay, formatMoney, formatPct } from "@/lib/money";

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
  loader: async () => {
    const [accounts, transactions, rollups, budgets, goals, events, categories] = await Promise.all(
      [
        getAccounts(),
        listTransactions({ period: CURRENT_PERIOD }),
        getMonthlyRollups(),
        getBudgets(),
        getGoals(),
        getTimelineEvents(),
        getCategories(),
      ],
    );
    const slices = await getSlices();
    return { accounts, transactions, rollups, budgets, goals, events, categories, slices };
  },
  component: OverviewPage,
});

function OverviewPage() {
  const { accounts, transactions, rollups, budgets, goals, events, categories, slices } =
    Route.useLoaderData() as {
      accounts: Account[];
      transactions: Transaction[];
      rollups: MonthlyRollup[];
      budgets: BudgetPeriod[];
      goals: Goal[];
      events: TimelineEvent[];
      categories: Category[];
      slices: Slice[];
    };
  const nw = summariseNetWorth(accounts);
  const ownership = summariseOwnership(
    accounts,
    accounts.filter((a) => isSliceable(a.kind)).map((a) => allocationFor(a, slices)),
  );
  const cf = summariseCashflow(transactions);
  const planned = budgets.reduce((s, b) => s + b.planned, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);

  const chart = rollups.map((r) => ({
    month: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${r.period}-01`)),
    income: r.income / 100,
    expense: r.expense / 100,
  }));

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
            <span className="numeric text-xs text-success">{formatPct(9.4)} this quarter</span>
          }
        >
          <div>
            <p className="numeric text-[46px] leading-none text-foreground">
              {formatMoney(ownership.owned, { whole: true })}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Cash {formatCompact(nw.cash)} · Investments {formatCompact(nw.investments)} ·
              Liabilities {formatCompact(nw.liabilities)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Truly yours. {formatCompact(ownership.custodial)} held for others is out of this
              figure; {formatCompact(ownership.earmarked)} is earmarked.
            </p>
          </div>
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
        </Panel>

        <div className="col-span-4 grid gap-5">
          <StatCard
            label="Available cash"
            value={formatMoney(nw.cash, { whole: true })}
            delta={12.4}
            hint="vs last month"
            icon={<Wallet className="h-4 w-4" />}
            className="pattern-arcs"
          />
          <StatCard
            label="Investments"
            value={formatMoney(nw.investments, { whole: true })}
            delta={14.7}
            hint="vs last month"
            icon={<TrendingUp className="h-4 w-4" />}
            className="pattern-hatch"
          />
          <StatCard
            label="Liabilities"
            value={formatMoney(nw.liabilities, { whole: true })}
            delta={-6.2}
            hint="paid down"
            icon={<Landmark className="h-4 w-4" />}
            className="pattern-steps"
          />
        </div>

        <Panel className="col-span-4" title="This month">
          <div className="space-y-4">
            <Row label="Income" value={formatMoney(cf.income)} tone="success" />
            <Row label="Expenses" value={formatMoney(cf.expense)} tone="destructive" />
            <Row label="Net cash flow" value={formatMoney(cf.net)} tone="foreground" />
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
            <Link to="/goals" className="text-xs text-primary">
              View all
            </Link>
          }
        >
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
        </Panel>

        <div className="col-span-4 grid gap-5">
          <Panel title="This month's insight" bodyClassName="p-5">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm leading-relaxed text-foreground">
                  You are spending 9% less than your normal pace, mainly because Dining and
                  Transport are lower than usual.
                </p>
                <Link
                  to="/assistant"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
                >
                  Ask about it <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </Panel>
          <Panel title="Upcoming bills">
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <p className="mt-2 text-sm text-foreground">No upcoming bills yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Card due dates will show up here once cycles are tracked.
              </p>
            </div>
          </Panel>
        </div>

        <Panel
          className="col-span-8"
          title="Recent activity"
          action={
            <Link to="/transactions" className="text-xs text-primary">
              All transactions
            </Link>
          }
          bodyClassName="p-0"
        >
          <table className="w-full text-sm">
            <tbody>
              {transactions.slice(0, 7).map((t) => (
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
              ))}
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

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`numeric text-sm text-${tone}`}>{value}</span>
    </div>
  );
}
