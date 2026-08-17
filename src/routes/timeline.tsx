import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-guard";
import { Bot, Coins, Flag, Receipt, Settings2 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/mm-ui";
import { getTimelineEvents, timelineKinds } from "@/data/repository";
import type { TimelineEvent, TimelineKind } from "@/data/schema";
import { dayKey, formatDay, formatMoney, formatTime } from "@/lib/money";
import { noonIst } from "@/lib/timeline";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline — Money Pal Financial OS" },
      {
        name: "description",
        content: "A chronological feed of money movements, AI insights, goal progress and bills.",
      },
      { property: "og:title", content: "Timeline — Money Pal" },
      { property: "og:description", content: "Your financial story, told in order." },
    ],
  }),
  beforeLoad: requireAuth,
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

  // Group on the IST calendar day, never a raw prefix slice — Postgres hands
  // midnight IST back as "…T18:30:00+00:00", which slices to the day before.
  const days = [...new Set(rows.map((e) => dayKey(e.occurred_at)))];

  return (
    <AppShell
      title="Timeline"
      subtitle="Your financial story, told in order."
      signature="timeline"
      actions={timelineKinds.map((k) => (
        <button
          key={k.id}
          onClick={() => setKind(k.id)}
          className={`h-9 rounded-full border px-4 text-sm transition-colors ${kind === k.id
            ? "border-primary/50 bg-primary/12 text-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
        >
          {k.label}
        </button>
      ))}
    >
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="scroll-rail max-h-[calc(100vh-260px)] pr-3">
          {days.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm text-foreground">Nothing here yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Events appear as your ledger fills up — budgets crossing their line, goals hitting a
                milestone, statements coming due.
              </p>
            </div>
          )}
          {days.map((day) => (
            <section key={day} className="mb-2">
              <p className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
                {formatDay(noonIst(day))}
              </p>
              <ul className="relative pl-[112px]">
                <span className="absolute left-[92px] top-0 bottom-0 w-px bg-border" />
                {rows
                  .filter((e) => dayKey(e.occurred_at) === day)
                  .map((e) => {
                    const Icon = icons[e.kind];
                    return (
                      <li key={e.id} className="rise group relative pb-4">
                        <span className="numeric absolute -left-[112px] top-4 w-[72px] text-right text-[11px] text-muted-foreground">
                          {formatTime(e.occurred_at)}
                        </span>
                        <span className="absolute -left-[31px] top-3.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-primary transition-transform group-hover:scale-110">
                          <Icon className="h-3 w-3" />
                        </span>

                        <div className="card-lift grain rounded-2xl border border-border bg-card px-4 py-3.5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{e.title}</p>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {e.detail}
                              </p>
                            </div>
                            {e.amount !== null && (
                              <span
                                className={`numeric shrink-0 text-sm ${e.amount > 0 ? "text-success" : "text-destructive"
                                  }`}
                              >
                                {formatMoney(e.amount, { sign: true })}
                              </span>
                            )}
                          </div>
                          {e.action_label && (
                            <button className="mt-3 rounded-lg border border-border px-2.5 py-1 text-[11px] text-foreground opacity-70 transition-all hover:bg-accent group-hover:opacity-100">
                              {e.action_label}
                            </button>
                          )}
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
              <Line
                label="AI insights"
                value={String(events.filter((e) => e.kind === "ai_insight").length)}
              />
              <Line
                label="Goal milestones"
                value={String(events.filter((e) => e.kind === "goal").length)}
              />
              <Line
                label="Bills tracked"
                value={String(events.filter((e) => e.kind === "bill").length)}
              />
            </ul>
          </Panel>
          <Panel title="Quiet hours">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Money Pal holds non-urgent notices between 10 PM and 8 AM, then delivers them in one
              calm digest.
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
