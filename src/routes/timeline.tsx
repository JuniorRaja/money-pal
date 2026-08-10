import { createFileRoute } from "@tanstack/react-router";
import { Bot, Coins, Flag, Receipt, Settings2 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/mm-ui";
import { getTimelineEvents, timelineKinds } from "@/data/repository";
import type { TimelineEvent, TimelineKind } from "@/data/schema";
import { formatDay, formatMoney, formatTime } from "@/lib/money";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline — Money Mate Financial OS" },
      {
        name: "description",
        content: "A chronological feed of money movements, AI insights, goal progress and bills.",
      },
      { property: "og:title", content: "Timeline — Money Mate" },
      { property: "og:description", content: "Your financial story, told in order." },
    ],
  }),
  loader: async () => ({ events: await getTimelineEvents() }),
  component: TimelinePage,
});

const icons: Record<TimelineKind, typeof Coins> = {
  money: Coins,
  ai_insight: Bot,
  goal: Flag,
  bill: Receipt,
  system: Settings2,
};

export function TimelinePage() {
  const { events } = Route.useLoaderData() as { events: TimelineEvent[] };
  const [kind, setKind] = useState<TimelineKind | "all">("all");
  const rows = kind === "all" ? events : events.filter((e) => e.kind === kind);

  const days = [...new Set(rows.map((e) => e.occurred_at.slice(0, 10)))];

  return (
    <AppShell
      title="Timeline"
      subtitle="Your financial story, told in order."
      signature="timeline"
      actions={timelineKinds.map((k) => (
        <button
          key={k.id}
          onClick={() => setKind(k.id)}
          className={`h-9 rounded-full border px-4 text-sm transition-colors ${
            kind === k.id
              ? "border-primary/50 bg-primary/12 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          {k.label}
        </button>
      ))}
    >
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="relative pl-8">
          <span className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
          {days.map((day) => (
            <section key={day} className="mb-8">
              <p className="mb-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {formatDay(`${day}T00:00:00`)}
              </p>
              <ul className="space-y-4">
                {rows
                  .filter((e) => e.occurred_at.startsWith(day))
                  .map((e) => {
                    const Icon = icons[e.kind];
                    return (
                      <li key={e.id} className="rise relative">
                        <span className="absolute -left-8 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-primary">
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="card-lift grain rounded-2xl border border-border bg-card p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-foreground">{e.title}</p>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.detail}</p>
                            </div>
                            {e.amount !== null && (
                              <span
                                className={`numeric shrink-0 text-sm ${
                                  e.amount > 0 ? "text-success" : "text-destructive"
                                }`}
                              >
                                {formatMoney(e.amount, { sign: true })}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <span className="text-[11px] text-muted-foreground">{formatTime(e.occurred_at)}</span>
                            {e.action_label && (
                              <button className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-accent">
                                {e.action_label}
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>

        <div className="space-y-5">
          <Panel title="This week">
            <ul className="space-y-3 text-sm">
              <Line label="Events logged" value={String(events.length)} />
              <Line label="AI insights" value={String(events.filter((e) => e.kind === "ai_insight").length)} />
              <Line label="Goal milestones" value={String(events.filter((e) => e.kind === "goal").length)} />
              <Line label="Bills tracked" value={String(events.filter((e) => e.kind === "bill").length)} />
            </ul>
          </Panel>
          <Panel title="Quiet hours">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Money Mate holds non-urgent notices between 10 PM and 8 AM, then delivers them in one calm
              digest.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric text-foreground">{value}</span>
    </li>
  );
}
