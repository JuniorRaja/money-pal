import { createFileRoute } from "@tanstack/react-router";
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
import { getCategories, getMonthlyRollups, listTransactions } from "@/data/repository";
import type { Category, MonthlyRollup, Transaction } from "@/data/schema";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Money Pal Financial OS" },
      {
        name: "description",
        content: "Income versus expense trends, savings rate and category breakdowns you can export.",
      },
      { property: "og:title", content: "Reports — Money Pal" },
      { property: "og:description", content: "The long view: trends, ratios and exportable summaries." },
    ],
  }),
  loader: async () => ({
    rollups: await getMonthlyRollups(),
    transactions: await listTransactions(),
    categories: await getCategories(),
  }),
  component: ReportsPage,
});

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
    savings: Math.round(((r.income - r.expense) / r.income) * 100),
  }));

  const income = rollups.reduce((s, r) => s + r.income, 0);
  const expense = rollups.reduce((s, r) => s + r.expense, 0);
  const rate = Math.round(((income - expense) / income) * 100);

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
        <StatCard label="Income (6 mo)" value={formatMoney(income, { whole: true })} delta={6.1} hint="vs prior period" />
        <StatCard label="Expenses (6 mo)" value={formatMoney(expense, { whole: true })} delta={-3.4} hint="vs prior period" />
        <StatCard label="Savings rate" value={`${rate}%`} delta={4.2} hint="six month average" />
        <StatCard label="Largest category" value={top?.name ?? "—"} hint={top ? formatMoney(top.value) : ""} />
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-7" title="Income vs expense">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ left: -16, top: 8 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
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
          </div>
        </Panel>

        <Panel className="col-span-5" title="Savings rate trend">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months} margin={{ left: -20, top: 8 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="savings" stroke="var(--color-primary)" strokeWidth={2.4} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
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
              {byCategory.map((r) => {
                const share = (r.value / byCategory.reduce((s, x) => s + x.value, 0)) * 100;
                return (
                  <tr key={r.name} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-5 py-3 text-foreground">{r.name}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${share}%` }} />
                        </div>
                        <span className="numeric text-xs text-muted-foreground">{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="numeric px-5 py-3 text-right text-foreground">{formatMoney(r.value)}</td>
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
