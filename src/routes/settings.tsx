import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/mm-ui";
import { useSession, type AppPrefs } from "@/components/session";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  saveNotificationChannel,
  updateImportRule,
  type UpdateImportRuleInput,
} from "@/data/mutations";
import {
  getAccounts,
  getCategories,
  getImportRules,
  getNotificationChannel,
  getSettings,
} from "@/data/repository";
import type { Account, Category, ImportRule, NotificationChannel } from "@/data/schema";
import { sendEmailTestFn, sendMonthlyEmailFn, sendTelegramDigestFn, sendTelegramTestFn } from "@/lib/notify.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Money Pal Financial OS" },
      {
        name: "description",
        content:
          "Profile, appearance, number formatting, assistant behaviour and privacy controls.",
      },
      { property: "og:title", content: "Settings — Money Pal" },
      { property: "og:description", content: "Make Money Pal feel like yours." },
    ],
  }),
  loader: async () => {
    const [settings, rules, categories, accounts, notificationChannel] = await Promise.all([
      getSettings(),
      getImportRules(),
      getCategories(),
      getAccounts(),
      getNotificationChannel(),
    ]);
    return { settings, rules, categories, accounts, notificationChannel };
  },
  component: SettingsPage,
});

const tabs = [
  "Profile",
  "Appearance",
  "Formatting",
  "Assistant",
  "Notifications",
  "Import rules",
  "Privacy",
] as const;
type Tab = (typeof tabs)[number];

const accents = [
  { name: "Antique gold", token: "oklch(0.72 0.11 78)" },
  { name: "Deep teal", token: "oklch(0.58 0.09 195)" },
  { name: "Ink violet", token: "oklch(0.55 0.13 300)" },
  { name: "Terracotta", token: "oklch(0.63 0.13 42)" },
  { name: "Forest", token: "oklch(0.55 0.10 152)" },
];

function SettingsPage() {
  const { settings, rules, categories, accounts, notificationChannel } = Route.useLoaderData();
  const { prefs, setPrefs } = useSession();
  const [tab, setTab] = useState<Tab>("Appearance");

  return (
    <AppShell title="Settings" subtitle="Make Money Pal feel like yours." signature="settings">
      <div className="grid max-w-4xl grid-cols-[168px_1fr] gap-5">
        <nav className="space-y-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors ${tab === t
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/60"
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
                      className={`rounded-2xl border p-4 text-left transition-colors ${prefs.theme === mode
                        ? "border-primary bg-accent/50"
                        : "border-border hover:bg-accent/40"
                        }`}
                    >
                      <div
                        className={`mb-3 h-14 rounded-xl border border-border ${mode === "light"
                          ? "bg-[oklch(0.98_0.008_84)]"
                          : "bg-[oklch(0.22_0.012_84)]"
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
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-colors ${prefs.accent === a.name
                        ? "border-primary text-foreground"
                        : "border-border text-muted-foreground"
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

          {tab === "Notifications" && <NotificationsTab channel={notificationChannel} />}

          {tab === "Import rules" && (
            <ImportRulesTab rules={rules} categories={categories} accounts={accounts} />
          )}

          {tab === "Privacy" && (
            <Panel title="Privacy & data">
              <p className="text-sm leading-relaxed text-muted-foreground">
                This build runs on a local demo ledger pinned to 07 Aug 2026. Nothing leaves the
                browser except the compact summary sent with assistant questions, and only while
                that setting is on.
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

/**
 * Telegram and Email notification config. Credentials live server-side only
 * (`notification_channels`, RLS-scoped to the owner) — nothing is inlined into
 * the client bundle.
 */
function NotificationsTab({ channel }: { channel: NotificationChannel }) {
  return (
    <>
      <TelegramPanel channel={channel} />
      <EmailPanel channel={channel} />
    </>
  );
}

function TelegramPanel({ channel }: { channel: NotificationChannel }) {
  const router = useRouter();
  const sendTest = useServerFn(sendTelegramTestFn);
  const sendDigest = useServerFn(sendTelegramDigestFn);

  const [token, setToken] = useState(channel.telegram_bot_token ?? "");
  const [chatId, setChatId] = useState(channel.telegram_chat_id ?? "");
  const [enabled, setEnabled] = useState(channel.telegram_enabled);
  const [busy, setBusy] = useState<"save" | "test" | "digest" | null>(null);

  async function save(next: { token?: string; chatId?: string; enabled?: boolean }) {
    const nextToken = next.token ?? token;
    const nextChatId = next.chatId ?? chatId;
    const nextEnabled = next.enabled ?? enabled;
    setBusy("save");
    try {
      await saveNotificationChannel({
        telegram_bot_token: nextToken || null,
        telegram_chat_id: nextChatId || null,
        telegram_enabled: nextEnabled,
      });
      setEnabled(nextEnabled);
      toast.success("Notification settings saved");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save notification settings");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (!token.trim() || !chatId.trim()) {
      toast.error("Add a bot token and chat id first");
      return;
    }
    setBusy("test");
    try {
      await sendTest({ data: { bot_token: token.trim(), chat_id: chatId.trim() } });
      toast.success("Test message sent — check Telegram");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reach Telegram");
    } finally {
      setBusy(null);
    }
  }

  async function digestNow() {
    setBusy("digest");
    try {
      const result = await sendDigest();
      toast.success(result.sent ? `Digest sent — ${result.count} event(s)` : "Nothing new to send");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the digest");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Telegram">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Message <span className="text-foreground">@BotFather</span> on Telegram, create a bot, and
        paste the token below. Message your new bot once so it can resolve your chat id, then paste
        that in too. One daily digest, nothing sends when there is nothing to say.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs text-muted-foreground">Bot token</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456:ABC-DEF..."
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Chat id</span>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="123456789"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <div>
          <p className="text-sm text-foreground">Daily digest</p>
          <p className="text-xs text-muted-foreground">
            {channel.last_digest_sent_at
              ? `Last sent ${new Date(channel.last_digest_sent_at).toLocaleString()}`
              : "Never sent yet"}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy !== null}
          aria-label="Enable Telegram digest"
          onCheckedChange={(next) => void save({ enabled: next })}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => void test()}
          disabled={busy !== null}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === "test" ? "Sending…" : "Send test message"}
        </button>
        <button
          onClick={() => void save({})}
          disabled={busy !== null}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => void digestNow()}
          disabled={busy !== null || !enabled}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === "digest" ? "Sending…" : "Send digest now"}
        </button>
      </div>
    </Panel>
  );
}

function EmailPanel({ channel }: { channel: NotificationChannel }) {
  const router = useRouter();
  const sendTest = useServerFn(sendEmailTestFn);
  const sendReport = useServerFn(sendMonthlyEmailFn);

  const [host, setHost] = useState(channel.smtp_host ?? "");
  const [port, setPort] = useState(channel.smtp_port ?? 587);
  const [user, setUser] = useState(channel.smtp_user ?? "");
  const [pass, setPass] = useState(channel.smtp_pass ?? "");
  const [from, setFrom] = useState(channel.smtp_from ?? "");
  const [enabled, setEnabled] = useState(channel.email_enabled);
  const [busy, setBusy] = useState<"save" | "test" | "report" | null>(null);

  async function save(next: { enabled?: boolean } = {}) {
    const nextEnabled = next.enabled ?? enabled;
    setBusy("save");
    try {
      await saveNotificationChannel({
        // Keep telegram settings unchanged
        telegram_bot_token: channel.telegram_bot_token,
        telegram_chat_id: channel.telegram_chat_id,
        telegram_enabled: channel.telegram_enabled,
        // Email settings
        email_enabled: nextEnabled,
        smtp_host: host || null,
        smtp_port: port || null,
        smtp_user: user || null,
        smtp_pass: pass || null,
        smtp_from: from || null,
      });
      setEnabled(nextEnabled);
      toast.success("Email settings saved");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save email settings");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (!host.trim() || !pass.trim() || !from.trim()) {
      toast.error("Fill in host, API key/password, and from address first");
      return;
    }
    setBusy("test");
    try {
      await sendTest({
        data: {
          smtp_host: host.trim(),
          smtp_port: port,
          smtp_user: user.trim(),
          smtp_pass: pass.trim(),
          smtp_from: from.trim(),
        },
      });
      toast.success("Test email sent — check your inbox");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send test email");
    } finally {
      setBusy(null);
    }
  }

  async function reportNow() {
    setBusy("report");
    try {
      const result = await sendReport();
      toast.success(
        result.sent ? "Monthly report sent — check your inbox" : result.reason || "Nothing to send"
      );
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Email reports">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Monthly financial summaries delivered to your inbox. Uses HTTP-based email providers —
        supported: <span className="text-foreground">smtp.resend.com</span> (Resend),{" "}
        <span className="text-foreground">mail.smtp2go.com</span> (SMTP2GO).
      </p>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs text-muted-foreground">Provider host</span>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="smtp.resend.com"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Port (optional)</span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 587)}
            placeholder="587"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Username (optional)</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="resend"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">API key / Password</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="re_xxxxx..."
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
        <label className="col-span-2 block">
          <span className="text-xs text-muted-foreground">From address</span>
          <input
            type="email"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="reports@yourdomain.com"
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <div>
          <p className="text-sm text-foreground">Monthly report</p>
          <p className="text-xs text-muted-foreground">
            {channel.last_email_sent_at
              ? `Last sent ${new Date(channel.last_email_sent_at).toLocaleString()}`
              : "Never sent yet"}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy !== null}
          aria-label="Enable email reports"
          onCheckedChange={(next) => void save({ enabled: next })}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => void test()}
          disabled={busy !== null}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === "test" ? "Sending…" : "Send test email"}
        </button>
        <button
          onClick={() => void save()}
          disabled={busy !== null}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => void reportNow()}
          disabled={busy !== null || !enabled}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === "report" ? "Sending…" : "Send report now"}
        </button>
      </div>
    </Panel>
  );
}

/**
 * Every merchant → category rule the import review has learned. Grouped
 * account-scoped first, then global, so the list reads in the same order
 * `applyImportRules` resolves them. Removing is a soft delete — a rule is never
 * dropped from the table, it just stops being listed.
 */
function ImportRulesTab({
  rules,
  categories,
  accounts,
}: {
  rules: ImportRule[];
  categories: Category[];
  accounts: Account[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ImportRule | null>(null);

  const groups = useMemo(() => {
    const accountName = (id: string) =>
      accounts.find((account) => account.id === id)?.name ?? "Archived account";
    const scopedIds = [
      ...new Set(rules.flatMap((rule) => (rule.account_id ? [rule.account_id] : []))),
    ];
    const scoped = scopedIds
      .map((id) => ({
        id,
        title: accountName(id),
        rules: rules.filter((rule) => rule.account_id === id),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    const global = rules.filter((rule) => rule.account_id === null);
    return global.length > 0
      ? [...scoped, { id: "global", title: "All accounts", rules: global }]
      : scoped;
  }, [accounts, rules]);

  const options = useMemo(
    () => categories.filter((category) => category.group !== "transfer"),
    [categories],
  );

  async function apply(input: UpdateImportRuleInput) {
    setBusyId(input.id);
    try {
      await updateImportRule(input);
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this rule");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Panel
        title="Import rules"
        action={
          rules.length > 0 ? (
            <span className="numeric text-xs text-muted-foreground">{rules.length} rules</span>
          ) : undefined
        }
        bodyClassName={rules.length > 0 ? "p-0" : "p-5"}
      >
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing learned yet. Correct a category while reviewing an import and tick “remember
            this” — the rule shows up here.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="bg-accent/40 px-5 py-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {group.title}
                </p>
                <ul className="divide-y divide-border/60">
                  {group.rules.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{rule.match}</p>
                        <p className="text-xs text-muted-foreground">
                          {rule.is_active
                            ? "Applied to matching merchants"
                            : "Paused — imports ignore it"}
                        </p>
                      </div>
                      <select
                        aria-label={`Category for ${rule.match}`}
                        value={rule.category_id}
                        disabled={busyId === rule.id}
                        onChange={(event) =>
                          void apply({ id: rule.id, category_id: event.target.value })
                        }
                        className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-50 sm:w-44"
                      >
                        {options.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <Switch
                        checked={rule.is_active}
                        disabled={busyId === rule.id}
                        aria-label={`Apply the rule for ${rule.match}`}
                        onCheckedChange={(next) => void apply({ id: rule.id, is_active: next })}
                      />
                      <button
                        type="button"
                        aria-label={`Remove the rule for ${rule.match}`}
                        onClick={() => setConfirmRemove(rule)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <AlertDialog
        open={Boolean(confirmRemove)}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the rule for “{confirmRemove?.match}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Future imports stop categorising it for you. Transactions already imported keep the
              category they were given. To keep the rule but stop it applying, use the toggle
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmRemove) return;
                const id = confirmRemove.id;
                setConfirmRemove(null);
                void apply({ id, deleted: true });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
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
          className={`block h-5 w-5 rounded-full bg-card shadow transition-transform duration-300 ${value ? "translate-x-5" : "translate-x-0"
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
    <div className="flex items-center justify-between border-b border-border/60 py-2.5">
      <p className="text-sm text-foreground">{label}</p>
      <div className="flex gap-1 rounded-lg border border-border p-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${value === o
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
