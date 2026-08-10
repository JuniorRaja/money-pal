import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Plus, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Bar, Panel, Ring, StatCard } from "@/components/mm-ui";
import { getGoals } from "@/data/repository";
import type { Goal } from "@/data/schema";
import { formatCompact, formatMoney } from "@/lib/money";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Money Pal Financial OS" },
      {
        name: "description",
        content: "Track savings goals, monthly contributions and projected finish dates.",
      },
      { property: "og:title", content: "Goals — Money Pal" },
      { property: "og:description", content: "Name what you're saving for, then watch it get closer." },
    ],
  }),
  loader: async () => ({ goals: await getGoals() }),
  component: GoalsPage,
});

function GoalsPage() {
  const { goals } = Route.useLoaderData() as { goals: Goal[] };
  const target = goals.reduce((s, g) => s + g.target, 0);
  const saved = goals.reduce((s, g) => s + g.saved, 0);
  const monthly = goals.reduce((s, g) => s + g.monthly_contribution, 0);

  return (
    <AppShell
      title="Goals"
      subtitle="Name what you're saving for, then watch it get closer."
      signature="goals"
      actions={
        <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]">
          <Plus className="h-3.5 w-3.5" /> New goal
        </button>
      }
    >
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="Total target" value={formatMoney(target, { whole: true })} hint={`${goals.length} goals`} />
        <StatCard label="Saved so far" value={formatMoney(saved, { whole: true })} delta={8.6} hint="vs last month" />
        <StatCard label="Monthly commitment" value={formatMoney(monthly, { whole: true })} hint="auto-transfers" />
        <StatCard
          label="Overall progress"
          value={`${Math.round((saved / target) * 100)}%`}
          hint="across every goal"
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-5">
        {goals.map((g) => {
          const pct = (g.saved / g.target) * 100;
          const remaining = g.target - g.saved;
          const months = Math.max(1, Math.ceil(remaining / g.monthly_contribution));
          return (
            <div key={g.id} className="card-lift grain rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-medium text-foreground">{g.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.blurb}</p>
                </div>
                <Ring value={pct} size={62} label={`${Math.round(pct)}%`} />
              </div>
              <p className="numeric mt-5 text-2xl text-foreground">{formatMoney(g.saved, { whole: true })}</p>
              <p className="text-xs text-muted-foreground">of {formatCompact(g.target)} target</p>
              <div className="mt-4">
                <Bar value={pct} tone={pct > 75 ? "success" : "primary"} />
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" /> {g.target_date}
                </span>
                <span className="numeric">{formatCompact(g.monthly_contribution)}/mo</span>
              </div>
              <p className="mt-3 rounded-lg bg-accent/50 px-3 py-2 text-[11px] text-muted-foreground">
                At this pace you finish in about {months} month{months === 1 ? "" : "s"}.
              </p>
            </div>
          );
        })}
      </div>

      <Panel className="mt-5" title="Suggestion from Money Pal">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-foreground">
            Moving an extra {formatCompact(500000)} a month from your surplus would pull your two nearest
            goals forward by roughly a quarter, without touching your emergency fund.
          </p>
        </div>
      </Panel>
    </AppShell>
  );
}
