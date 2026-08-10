import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Plus } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { AppShell } from "@/components/app-shell";
import { Bar, Panel, StatCard } from "@/components/mm-ui";
import { CURRENT_PERIOD, getBudgets, getCategories } from "@/data/repository";
import type { BudgetPeriod, Category } from "@/data/schema";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Money Mate Financial OS" },
      {
        name: "description",
        content: "Plan every category, watch the pace, and get warned before a budget slips.",
      },
      { property: "og:title", content: "Budgets — Money Mate" },
      { property: "og:description", content: "Give every rupee a job before the month spends it for you." },
    ],
  }),
  loader: async () => ({
    budgets: await getBudgets(CURRENT_PERIOD),
    categories: await getCategories(),
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
  const { budgets, categories } = Route.useLoaderData() as {
    budgets: BudgetPeriod[];
    categories: Category[];
  };
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const planned = budgets.reduce((s, b) => s + b.planned, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);
  const overspent = budgets.filter((b) => b.spent > b.planned);

  const pie = budgets.map((b) => ({ name: name(b.category_id), value: b.spent / 100 }));

  return (
    <AppShell
      title="Budgets"
      subtitle="Give every rupee a job before the month spends it for you."
      signature="budgets"
      actions={
        <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]">
          <Plus className="h-3.5 w-3.5" /> New budget
        </button>
      }
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="Planned" value={formatMoney(planned, { whole: true })} hint="August 2026" />
        <StatCard label="Spent so far" value={formatMoney(spent, { whole: true })} delta={-9.1} hint="vs usual pace" />
        <StatCard label="Remaining" value={formatMoney(planned - spent, { whole: true })} hint="24 days left" />
        <StatCard label="Categories over" value={String(overspent.length)} hint="need attention" />
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-8" title="Category pacing">
          <ul className="space-y-5">
            {budgets.map((b) => {
              const pct = (b.spent / b.planned) * 100;
              const over = pct > 100;
              return (
                <li key={b.id}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-foreground">{name(b.category_id)}</span>
                    <span className="numeric text-muted-foreground">
                      {formatMoney(b.spent)} <span className="text-border">/</span>{" "}
                      {formatMoney(b.planned)}
                    </span>
                  </div>
                  <Bar value={pct} tone={over ? "destructive" : pct > 85 ? "warning" : "primary"} />
                  <p className={`mt-1 text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
                    {over
                      ? `Over by ${formatMoney(b.spent - b.planned)}`
                      : `${formatMoney(b.planned - b.spent)} left · ${Math.round(pct)}% used`}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="col-span-4 space-y-5">
          <Panel title="Where it went">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
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
                    formatter={(v: number | string) => `\u20B9${Number(v).toLocaleString("en-IN")}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Alerts">
            <ul className="space-y-3">
              {(overspent.length ? overspent : budgets.slice(0, 2)).map((b) => (
                <li key={b.id} className="flex gap-3 rounded-xl border border-border bg-accent/40 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm text-foreground">{name(b.category_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.spent > b.planned
                        ? `Over budget by ${formatMoney(b.spent - b.planned)}.`
                        : `Pacing at ${Math.round((b.spent / b.planned) * 100)}% with 24 days left.`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
