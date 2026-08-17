/**
 * Notification send functions: Telegram and Email.
 *
 * Telegram: One HTTPS POST to the Bot API — no SDK.
 * Email: HTTP-based provider APIs (Resend, SMTP2GO) via email.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";

import { getTimelineEvents } from "@/data/repository";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendEmail, sendTestEmail, type EmailConfig } from "@/lib/email.server";
import { formatTelegramDigest } from "@/lib/notify-digest";
import {
  formatMonthlyReportHtml,
  formatMonthlyReportText,
  type MonthlyReportData,
} from "@/lib/notify-email";
import { currentPeriod } from "@/lib/period";

const DAY_MS = 86_400_000;

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const payload = (await res.json().catch(() => null)) as { description?: string } | null;
  if (!res.ok) {
    throw new Error(
      payload?.description || "Telegram rejected the message — check token and chat id.",
    );
  }
}

export interface SendTelegramTestInput {
  bot_token: string;
  chat_id: string;
}

export const sendTelegramTestFn = createServerFn({ method: "POST" })
  .validator((input: SendTelegramTestInput) => {
    if (!input.bot_token?.trim()) throw new Error("bot_token is required");
    if (!input.chat_id?.trim()) throw new Error("chat_id is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    await sendTelegramMessage(
      data.bot_token.trim(),
      data.chat_id.trim(),
      "✅ Money Pal is connected.",
    );
    return { success: true };
  });

export const sendTelegramDigestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: channel, error } = await supabase
      .from("notification_channels")
      .select("telegram_bot_token, telegram_chat_id, telegram_enabled, last_digest_sent_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!channel?.telegram_enabled || !channel.telegram_bot_token || !channel.telegram_chat_id) {
      throw new Error("Connect and enable Telegram in Settings first.");
    }

    const since = channel.last_digest_sent_at
      ? Date.parse(channel.last_digest_sent_at)
      : Date.now() - DAY_MS;
    const events = await getTimelineEvents();
    const fresh = events.filter((e) => Date.parse(e.occurred_at) > since);

    const text = formatTelegramDigest(fresh);
    if (!text) return { sent: false, count: 0 };

    await sendTelegramMessage(channel.telegram_bot_token, channel.telegram_chat_id, text);

    const { error: touchError } = await supabase
      .from("notification_channels")
      .update({ last_digest_sent_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (touchError) throw touchError;

    return { sent: true, count: fresh.length };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Email Functions
// ─────────────────────────────────────────────────────────────────────────────

export interface SendEmailTestInput {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
}

export const sendEmailTestFn = createServerFn({ method: "POST" })
  .validator((input: SendEmailTestInput) => {
    if (!input.smtp_host?.trim()) throw new Error("SMTP host is required");
    if (!input.smtp_pass?.trim()) throw new Error("API key / password is required");
    if (!input.smtp_from?.trim()) throw new Error("From address is required");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Get user's email from profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.email) {
      throw new Error("No email address found in your profile.");
    }

    const config: EmailConfig = {
      host: data.smtp_host.trim(),
      port: data.smtp_port || 587,
      user: data.smtp_user?.trim() || null,
      pass: data.smtp_pass.trim(),
      from: data.smtp_from.trim(),
    };

    const result = await sendTestEmail(config, profile.email);
    if (!result.success) {
      throw new Error(result.error || "Failed to send test email");
    }

    return { success: true, messageId: result.messageId };
  });

export const sendMonthlyEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Get email config from notification_channels
    const { data: channel, error: channelError } = await supabase
      .from("notification_channels")
      .select("email_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (channelError) throw channelError;

    // Type assertion for new columns not yet in generated types
    const ch = channel as {
      email_enabled?: boolean;
      smtp_host?: string;
      smtp_port?: number;
      smtp_user?: string;
      smtp_pass?: string;
      smtp_from?: string;
    } | null;

    if (!ch?.email_enabled || !ch.smtp_host || !ch.smtp_pass || !ch.smtp_from) {
      throw new Error("Configure and enable email in Settings first.");
    }

    // Get user profile for email and display name
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.email) {
      throw new Error("No email address found in your profile.");
    }

    // Fetch report data
    const period = currentPeriod();
    const reportData = await fetchReportData(supabase, userId, period, profile.display_name || "");

    const html = formatMonthlyReportHtml(reportData);
    const text = formatMonthlyReportText(reportData);

    if (!html || !text) {
      return { sent: false, reason: "No transactions this month" };
    }

    const config: EmailConfig = {
      host: ch.smtp_host,
      port: ch.smtp_port || 587,
      user: ch.smtp_user || null,
      pass: ch.smtp_pass,
      from: ch.smtp_from,
    };

    const periodDisplay = new Date(period + "-01").toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });

    const result = await sendEmail(config, {
      to: profile.email,
      subject: `Money Pal - ${periodDisplay} Financial Report`,
      html,
      text,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email report");
    }

    // Update last_email_sent_at
    const { error: updateError } = await supabase
      .from("notification_channels")
      .update({ last_email_sent_at: new Date().toISOString() } as Record<string, unknown>)
      .eq("user_id", userId);
    if (updateError) throw updateError;

    return { sent: true, messageId: result.messageId };
  });

/**
 * Fetch all data needed for the monthly report.
 */
async function fetchReportData(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  userId: string,
  period: string,
  displayName: string
): Promise<MonthlyReportData> {
  const periodMonth = `${period}-01`;

  // Fetch all data in parallel
  const [cashflowRes, categoryRes, budgetRes, goalRes, holdingRes] = await Promise.all([
    supabase
      .from("v_monthly_cashflow")
      .select("income, expense, net, txn_count")
      .eq("period_month", periodMonth)
      .maybeSingle(),
    supabase
      .from("v_category_spend")
      .select("category_id, spent")
      .eq("period_month", periodMonth)
      .order("spent", { ascending: false })
      .limit(10),
    supabase
      .from("v_budget_progress")
      .select("category_name, planned, spent, color_token")
      .eq("period_month", periodMonth),
    supabase.from("v_goal_progress").select("name, target_amount, saved, target_date"),
    supabase.from("v_holdings_valuation").select("current_value, invested"),
  ]);

  // Get category names for top spend
  const categoryIds = (categoryRes.data ?? []).map((c) => c.category_id).filter(Boolean);
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color_token")
    .in("id", categoryIds.length > 0 ? categoryIds : ["__none__"]);

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

  return {
    period,
    displayName,
    cashflow: {
      income: Number(cashflowRes.data?.income ?? 0),
      expense: Number(cashflowRes.data?.expense ?? 0),
      net: Number(cashflowRes.data?.net ?? 0),
      txnCount: Number(cashflowRes.data?.txn_count ?? 0),
    },
    topCategories: (categoryRes.data ?? [])
      .filter((c) => c.category_id && categoryMap.has(c.category_id))
      .slice(0, 5)
      .map((c) => ({
        name: categoryMap.get(c.category_id)?.name ?? "Unknown",
        spent: Number(c.spent ?? 0),
        colorToken: categoryMap.get(c.category_id)?.color_token ?? "gray",
      })),
    budgets: (budgetRes.data ?? []).map((b) => ({
      categoryName: b.category_name ?? "Unknown",
      planned: Number(b.planned ?? 0),
      spent: Number(b.spent ?? 0),
      colorToken: b.color_token ?? "gray",
    })),
    goals: (goalRes.data ?? []).map((g) => ({
      name: g.name ?? "Unnamed Goal",
      target: Number(g.target_amount ?? 0),
      saved: Number(g.saved ?? 0),
      targetDate: g.target_date,
    })),
    holdings: {
      totalValue: (holdingRes.data ?? []).reduce((sum, h) => sum + Number(h.current_value ?? 0), 0),
      totalInvested: (holdingRes.data ?? []).reduce((sum, h) => sum + Number(h.invested ?? 0), 0),
    },
  };
}
