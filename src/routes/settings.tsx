import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/mm-ui";
import { useSession, type AppPrefs } from "@/components/session";
import { getSettings } from "@/data/repository";
import type { UserSettings } from "@/data/schema";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Money Mate Financial OS" },
      {
        name: "description",
        content: "Profile, appearance, number formatting, assistant behaviour and privacy controls.",
      },
      { property: "og:title", content: "Settings — Money Mate" },
      { property: "og:description", content: "Make Money Mate feel like yours." },
    ],
  }),
  loader: async () => ({ settings: await getSettings() }),
  component: SettingsPage,
});

const tabs = ["Profile", "Appearance", "Formatting", "Assistant", "Privacy"] as const;
type Tab = (typeof tabs)[number];

const accents = [
  { name: "Antique gold", token: "oklch(0.72 0.11 78)" },
  { name: "Deep teal", token: "oklch(0.58 0.09 195)" },
  { name: "Ink violet", token: "oklch(0.55 0.13 300)" },
  { name: "Terracotta", token: "oklch(0.63 0.13 42)" },
  { name: "Forest", token: "oklch(0.55 0.10 152)" },
];

function SettingsPage() {
  const { settings } = Route.useLoaderData() as { settings: UserSettings };
  const { prefs, setPrefs } = useSession();
  const [tab, setTab] = useState<Tab>("Appearance");

  return (
    <AppShell title="Settings" subtitle="Make Money Mate feel like yours." signature="settings">
      <div className="grid max-w-4xl grid-cols-[168px_1fr] gap-5">
        <nav className="space-y-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors ${
                tab === t ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-4">

          {tab === "Profile" && (
            <Panel title="Profile">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Display name" value={settings.display_name} />
                <Field label="Email" value={settings.email} />
                <Field label="Currency" value={settings.currency} />
                <Field label="Week starts on" value={settings.week_starts_on} />
              </div>
            </Panel>
          )}

          {tab === "Appearance" && (
            <>
              <Panel title="Theme">
                <div className="grid grid-cols-2 gap-4">
                  {(["light", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPrefs({ theme: mode })}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        prefs.theme === mode ? "border-primary bg-accent/50" : "border-border hover:bg-accent/40"
                      }`}
                    >
                      <div
                        className={`mb-3 h-20 rounded-xl border border-border ${
                          mode === "light" ? "bg-[oklch(0.98_0.008_84)]" : "bg-[oklch(0.22_0.012_84)]"
                        }`}
                      />
                      <p className="text-sm capitalize text-foreground">{mode} mode</p>
                      <p className="text-xs text-muted-foreground">
                        {mode === "light" ? "Warm paper, ink type" : "Low-glare evening ledger"}
                      </p>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Accent colour">
                <div className="flex flex-wrap gap-3">
                  {accents.map((a) => (
                    <button
                      key={a.name}
                      onClick={() => setPrefs({ accent: a.name })}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-colors ${
                        prefs.accent === a.name ? "border-primary text-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full" style={{ background: a.token }} />
                      {a.name}
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Motion & layout">
                <Toggle
                  label="Reduce motion"
                  hint="Turns off entrance animations and hover lifts."
                  value={prefs.reduceMotion}
                  onChange={(v) => setPrefs({ reduceMotion: v })}
                />
                <Toggle
                  label="Collapsed sidebar"
                  hint="Keeps navigation as icons only."
                  value={prefs.sidebar === "collapsed"}
                  onChange={(v) => setPrefs({ sidebar: v ? "collapsed" : "expanded" })}
                />
              </Panel>
            </>
          )}

          {tab === "Formatting" && (
            <Panel title="Numbers">
              <Choice
                label="Number format"
                options={["indian", "international"]}
                value={prefs.numberFormat}
                onChange={(v) => setPrefs({ numberFormat: v as AppPrefs["numberFormat"] })}
              />
              <Choice
                label="Week starts on"
                options={["Monday", "Sunday"]}
                value={prefs.weekStartsOn}
                onChange={(v) => setPrefs({ weekStartsOn: v as AppPrefs["weekStartsOn"] })}
              />
              <Toggle
                label="Round to nearest rupee"
                hint="Hides paise in lists and summaries."
                value={prefs.roundToNearest}
                onChange={(v) => setPrefs({ roundToNearest: v })}
              />
            </Panel>
          )}

          {tab === "Assistant" && (
            <Panel title="AI Assistant">
              <Choice
                label="Answer style"
                options={["concise", "detailed"]}
                value={prefs.assistantTone}
                onChange={(v) => setPrefs({ assistantTone: v as AppPrefs["assistantTone"] })}
              />
              <Toggle
                label="Share ledger summary"
                hint="Sends a compact, aggregated snapshot so answers reference your real numbers."
                value={prefs.assistantContext}
                onChange={(v) => setPrefs({ assistantContext: v })}
              />
            </Panel>
          )}

          {tab === "Privacy" && (
            <Panel title="Privacy & data">
              <p className="text-sm leading-relaxed text-muted-foreground">
                This build runs on a local demo ledger pinned to 07 Aug 2026. Nothing leaves the browser except
                the compact summary sent with assistant questions, and only while that setting is on.
              </p>
              <button className="mt-4 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10">
                Reset local session
              </button>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        defaultValue={value}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-3 last:border-0">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`h-6 w-11 rounded-full p-0.5 transition-colors ${value ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-card shadow transition-transform duration-300 ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-3">
      <p className="text-sm text-foreground">{label}</p>
      <div className="flex gap-1 rounded-lg border border-border p-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${
              value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
