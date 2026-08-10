import { createFileRoute } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { AppShell } from "@/components/app-shell";
import { Panel, Sparkline, StatCard } from "@/components/mm-ui";
import { getHoldings } from "@/data/repository";
import type { Holding, HoldingClass } from "@/data/schema";
import { formatMoney, formatPct } from "@/lib/money";

export const Route = createFileRoute("/investments")({
  head: () => ({
    meta: [
      { title: "Investments — Money Mate Financial OS" },
      {
        name: "description",
        content: "Holdings, allocation and returns across equity, funds, gold and fixed income.",
      },
      { property: "og:title", content: "Investments — Money Mate" },
      { property: "og:description", content: "What your money is doing while you sleep." },
    ],
  }),
  loader: async () => ({ holdings: await getHoldings() }),
  component: InvestmentsPage,
});

const classLabel: Record<HoldingClass, string> = {
  equity: "Equity",
  mutual_fund: "Mutual Funds",
  gold: "Gold",
  fixed_income: "Fixed Income",
  crypto: "Crypto",
};

const slices = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-muted-foreground)",
];

function InvestmentsPage() {
  const { holdings } = Route.useLoaderData() as { holdings: Holding[] };
  const invested = holdings.reduce((s, h) => s + h.invested, 0);
  const current = holdings.reduce((s, h) => s + h.current_value, 0);
  const gain = current - invested;
  const dayChange = holdings.reduce((s, h) => s + (h.current_value * h.day_change_pct) / 100, 0);

  const byClass = new Map<HoldingClass, number>();
  for (const h of holdings) byClass.set(h.asset_class, (byClass.get(h.asset_class) ?? 0) + h.current_value);
  const pie = [...byClass.entries()].map(([k, v]) => ({ name: classLabel[k], value: v / 100 }));

  return (
    <AppShell
      title="Investments"
      subtitle="What your money is doing while you sleep."
      signature="investments"
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="Current value" value={formatMoney(current, { whole: true })} delta={14.7} hint="since inception" />
        <StatCard label="Invested" value={formatMoney(invested, { whole: true })} hint="total cost" />
        <StatCard
          label="Unrealised gain"
          value={formatMoney(gain, { whole: true })}
          delta={(gain / invested) * 100}
          hint="absolute return"
        />
        <StatCard label="Today" value={formatMoney(Math.round(dayChange), { sign: true })} hint="market movement" />
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-8" title="Holdings" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Instrument</th>
                <th className="px-2 py-3 text-left font-medium">Class</th>
                <th className="px-2 py-3 text-right font-medium">Units</th>
                <th className="px-2 py-3 text-right font-medium">Invested</th>
                <th className="px-2 py-3 text-right font-medium">Value</th>
                <th className="px-5 py-3 text-right font-medium">Day</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40">
                  <td className="px-5 py-3 text-foreground">{h.name}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground">{classLabel[h.asset_class]}</td>
                  <td className="numeric px-2 py-3 text-right text-muted-foreground">{h.units}</td>
                  <td className="numeric px-2 py-3 text-right text-muted-foreground">{formatMoney(h.invested, { whole: true })}</td>
                  <td className="numeric px-2 py-3 text-right text-foreground">{formatMoney(h.current_value, { whole: true })}</td>
                  <td className={`numeric px-5 py-3 text-right ${h.day_change_pct >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatPct(h.day_change_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="col-span-4 space-y-5">
          <Panel title="Allocation">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" innerRadius={54} outerRadius={88} paddingAngle={2} stroke="none">
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
            <ul className="mt-3 space-y-2 text-xs">
              {pie.map((p, i) => (
                <li key={p.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: slices[i % slices.length] }} />
                    {p.name}
                  </span>
                  <span className="numeric text-foreground">
                    {Math.round((p.value / (current / 100)) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Portfolio trend">
            <Sparkline points={[58, 61, 60, 65, 68, 66, 72, 75, 78, 81, 84, 89]} width={280} height={72} tone="success" />
            <p className="mt-3 text-xs text-muted-foreground">
              Twelve-month value trend, rebased. Steady since the March correction.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
