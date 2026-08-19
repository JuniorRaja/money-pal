import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-guard";
import { Download, FileText } from "lucide-react";
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Panel, StatCard } from "@/components/mm-ui";
import { ReportsSkeleton } from "@/components/route-skeletons";
import {
  CURRENT_PERIOD,
  getCategories,
  getMonthlyRollups,
  listTransactions,
} from "@/data/repository";
import type { Category, MonthlyRollup, Transaction } from "@/data/schema";
import { pctChange, rollupWindow, savingsRate } from "@/lib/compare";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Money Pal Financial OS" },
      {
        name: "description",
        content:
          "Income versus expense trends, savings rate and category breakdowns you can export.",
      },
      { property: "og:title", content: "Reports — Money Pal" },
      {
        property: "og:description",
        content: "The long view: trends, ratios and exportable summaries.",
      },
    ],
  }),
  beforeLoad: requireAuth,
  loader: async () => ({
    rollups: await getMonthlyRollups(),
    transactions: await listTransactions(),
    categories: await getCategories(),
  }),
  pendingComponent: ReportsSkeleton,
  pendingMs: 200,
  pendingMinMs: 500,
  component: ReportsPage,
});

/** Keeps the null through, so a month with no income stays a gap in the line. */
const round = (value: number | null) => (value === null ? null : Math.round(value));

function EmptyChart({ note }: { note: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
      <p className="text-sm text-foreground">Nothing to chart yet.</p>
      <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function ReportsPage() {
  const { rollups, transactions, categories } = Route.useLoaderData() as {
    rollups: MonthlyRollup[];
    transactions: Transaction[];
    categories: Category[];
  };

  const months = rollups.map((r) => ({
    month: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${r.period}-01`)),
    income: r.income / 100,
    expense: r.expense / 100,
    // Null, not NaN: a month with no income has no savings rate at all, and the
    // line breaks over the gap instead of dropping to an invented zero.
    savings: round(savingsRate(r.income, r.expense)),
  }));

  // Six complete months, so the window is never half a running month wide. A
  // first-month user has no complete months at all, so fall back to this one.
  const sixMonths = rollupWindow(rollups, 6);
  const thisMonth = rollups.find((r) => r.period === CURRENT_PERIOD);
  const partial = sixMonths.covered === 0;
  const scope = partial ? "this month" : `last ${sixMonths.size} months`;
  const income = partial ? (thisMonth?.income ?? 0) : sixMonths.income;
  const expense = partial ? (thisMonth?.expense ?? 0) : sixMonths.expense;
  const prior = partial ? null : sixMonths.prior;

  const rate = savingsRate(income, expense);
  const priorRate = prior ? savingsRate(prior.income, prior.expense) : null;
  // A rate gap is percentage points, never a percentage of a percentage.
  const rateDelta = rate !== null && priorRate !== null ? rate - priorRate : null;
  const priorHint = prior ? `vs prior ${sixMonths.size} months` : "no prior period yet";

  const byCategory = categories
    .map((c) => ({
      name: c.name,
      value: transactions
        .filter((t) => t.category_id === c.id && t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const top = byCategory[0];
  const categoryTotal = byCategory.reduce((s, r) => s + r.value, 0);

  return (
    <AppShell
      title="Reports"
      subtitle="The long view: trends, ratios and summaries you can hand to anyone."
      signature="reports"
      actions={
        <>
          <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-accent">
            <FileText className="h-3.5 w-3.5" /> PDF summary
          </button>
          <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-accent">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          label={`Income · ${scope}`}
          value={formatMoney(income, { whole: true })}
          delta={prior ? pctChange(income, prior.income) : null}
          hint={priorHint}
        />
        <StatCard
          label={`Expenses · ${scope}`}
          value={formatMoney(expense, { whole: true })}
          delta={prior ? pctChange(expense, prior.expense) : null}
          deltaTone="down-good"
          hint={priorHint}
        />
        <StatCard
          label={`Savings rate · ${scope}`}
          value={rate === null ? "—" : `${Math.round(rate)}%`}
          delta={rateDelta}
          deltaUnit="pp"
          hint={rate === null ? "no income recorded" : priorHint}
        />
        <StatCard
          label="Largest category"
          value={top?.name ?? "—"}
          hint={top ? formatMoney(top.value) : "no spending recorded yet"}
        />
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-7" title="Income vs expense">
          <div className="h-[280px]">
            {months.length === 0 ? (
              <EmptyChart note="Months appear here as soon as transactions land." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ left: -16, top: 8 }}>
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
                    cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number | string) => `\u20B9${Number(v).toLocaleString("en-IN")}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <RBar dataKey="income" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
                  <RBar dataKey="expense" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="col-span-5" title="Savings rate trend">
          <div className="h-[280px]">
            {months.length === 0 ? (
              <EmptyChart note="One point per month, once there are months to plot." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={months} margin={{ left: -20, top: 8 }}>
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
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="savings"
                    stroke="var(--color-primary)"
                    strokeWidth={2.4}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="col-span-12" title="Spend by category" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Category</th>
                <th className="px-2 py-3 text-left font-medium">Share</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No categorised spending yet. Import or add transactions and this table fills in.
                  </td>
                </tr>
              )}
              {byCategory.map((r) => {
                const share = categoryTotal === 0 ? 0 : (r.value / categoryTotal) * 100;
                return (
                  <tr
                    key={r.name}
                    className="border-b border-border/60 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-5 py-3 text-foreground">{r.name}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-700"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <span className="numeric text-xs text-muted-foreground">
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="numeric px-5 py-3 text-right text-foreground">
                      {formatMoney(r.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </AppShell>
  );
}
