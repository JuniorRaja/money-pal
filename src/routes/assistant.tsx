import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Bot, Loader2, Sparkles, User } from "lucide-react";
import { useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/mm-ui";
import { useSession } from "@/components/session";
import { askAssistant } from "@/lib/assistant.functions";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Money Pal Financial OS" },
      {
        name: "description",
        content: "Ask Money Pal about spending, budgets and goals — answered from your own ledger.",
      },
      { property: "og:title", content: "AI Assistant — Money Pal" },
      {
        property: "og:description",
        content: "Ask anything about your money. Answers come from your ledger.",
      },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const starters = [
  "Where did my money go this month?",
  "Am I on track for my goals?",
  "Which budget is closest to breaking?",
  "How much can I safely invest right now?",
];

function AssistantPage() {
  const { prefs } = useSession();
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I have your August ledger open. Ask about spending, budgets, goals or what changed since last month.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history = messages.filter((m) => m.role === "user" || m.role === "assistant");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await ask({
        data: {
          question: q,
          tone: prefs.assistantTone,
          shareContext: prefs.assistantContext,
          history: history.slice(1),
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  return (
    <AppShell
      title="AI Assistant"
      subtitle="Ask anything about your money. Answers come from your own ledger."
      signature="assistant"
    >
      <div className="grid grid-cols-[1fr_320px] gap-5">
        <Panel bodyClassName="flex h-[620px] flex-col p-0">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {messages.map((m, i) => (
              <div key={i} className={`rise flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div
                  className={`max-w-[76%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-accent/40 text-foreground"
                  }`}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Money Pal is reading your ledger...
              </div>
            )}
            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-3 border-t border-border p-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about spending, budgets, goals..."
              className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-[1.04] disabled:opacity-40 disabled:hover:scale-100"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </Panel>

        <div className="space-y-5">
          <Panel title="Try asking">
            <ul className="space-y-2">
              {starters.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => void send(s)}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="What it can see">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {prefs.assistantContext
                  ? "A compact aggregated digest — balances, this month's totals, budget pacing and goal progress. Never individual raw rows."
                  : "Ledger sharing is off, so answers stay general. Turn it on in Settings → Assistant."}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
