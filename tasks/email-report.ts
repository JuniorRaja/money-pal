import { defineTask } from "nitro/task";

import { sendEmail, type EmailConfig } from "@/lib/email.server";
import {
  formatMonthlyReportHtml,
  formatMonthlyReportText,
  type MonthlyReportData,
} from "@/lib/notify-email";

/**
 * P3-3 — monthly email report. Scheduled from nitro.config.ts onto a Cloudflare
 * cron trigger on the 1st of each month at 06:00 UTC (11:30 IST).
 *
 * Fans out to every user with email_enabled = true. Uses supabaseAdmin to
 * bypass RLS — there is no authenticated user in a cron context.
 *
 * Reports on the *previous* month (if run on Aug 1st, reports on July).
 */
export default defineTask({
  meta: {
    name: "email:report",
    description: "Send monthly email reports to all enabled users",
  },
  async run() {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Calculate previous month's period (YYYY-MM)
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
    const periodMonth = `${period}-01`;

    // 1. Find all users with email enabled
    const { data: channels, error: channelsError } = await supabaseAdmin
      .from("notification_channels")
      .select("user_id, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from")
      .eq("email_enabled", true)
      .is("deleted_at", null);

    if (channelsError) throw channelsError;
    if (!channels?.length) {
      console.log("[email:report] No users with email enabled");
      return { result: { sent: 0, skipped: 0, failed: 0 } };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const channel of channels) {
      // Type assertion for columns not yet in generated types
      const ch = channel as {
        user_id: string;
        smtp_host?: string;
        smtp_port?: number;
        smtp_user?: string;
        smtp_pass?: string;
        smtp_from?: string;
      };

      if (!ch.smtp_host || !ch.smtp_pass || !ch.smtp_from) {
        skipped++;
        continue;
      }

      try {
        // 2. Get user profile for email and display name
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("email, display_name")
          .eq("user_id", ch.user_id)
          .maybeSingle();

        if (profileError || !profile?.email) {
          console.warn(`[email:report] No email for user ${ch.user_id}`);
          skipped++;
          continue;
        }

        // 3. Fetch report data for this user
        const reportData = await fetchReportDataForUser(
          supabaseAdmin,
          ch.user_id,
          period,
          periodMonth,
          profile.display_name || ""
        );

        const html = formatMonthlyReportHtml(reportData);
        const text = formatMonthlyReportText(reportData);

        if (!html || !text) {
          // No transactions — skip but update timestamp to avoid re-checking
          await supabaseAdmin
            .from("notification_channels")
            .update({ last_email_sent_at: new Date().toISOString() })
            .eq("user_id", ch.user_id);
          skipped++;
          continue;
        }

        // 4. Send the email
        const config: EmailConfig = {
          host: ch.smtp_host,
          port: ch.smtp_port || 587,
          user: ch.smtp_user || null,
          pass: ch.smtp_pass,
          from: ch.smtp_from,
        };

        const periodDisplay = prevMonth.toLocaleDateString("en-IN", {
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
          console.error(
            `[email:report] Failed to send for ${ch.user_id}:`,
            result.error
          );
          failed++;
          continue;
        }

        // 5. Update last_email_sent_at
        const { error: updateError } = await supabaseAdmin
          .from("notification_channels")
          .update({ last_email_sent_at: new Date().toISOString() })
          .eq("user_id", ch.user_id);

        if (updateError) {
          console.error(`[email:report] Failed to update timestamp for ${ch.user_id}:`, updateError);
        }

        sent++;
      } catch (e) {
        console.error(`[email:report] Unexpected error for ${ch.user_id}:`, e);
        failed++;
      }
    }

    console.log(`[email:report] period=${period} sent=${sent} skipped=${skipped} failed=${failed}`);
    return { result: { period, sent, skipped, failed } };
  },
});

/**
 * Fetch all data needed for the monthly report for a specific user.
 * Uses supabaseAdmin to bypass RLS and explicitly filters by user_id.
 */
async function fetchReportDataForUser(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  userId: string,
  period: string,
  periodMonth: string,
  displayName: string
): Promise<MonthlyReportData> {
  // Fetch all data in parallel
  const [cashflowRes, categoryRes, budgetRes, goalRes, holdingRes] = await Promise.all([
    supabaseAdmin
      .from("v_monthly_cashflow")
      .select("income, expense, net, txn_count")
      .eq("user_id", userId)
      .eq("period_month", periodMonth)
      .maybeSingle(),
    supabaseAdmin
      .from("v_category_spend")
      .select("category_id, spent")
      .eq("user_id", userId)
      .eq("period_month", periodMonth)
      .order("spent", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("v_budget_progress")
      .select("category_name, planned, spent, color_token")
      .eq("user_id", userId)
      .eq("period_month", periodMonth),
    supabaseAdmin
      .from("v_goal_progress")
      .select("name, target_amount, saved, target_date")
      .eq("user_id", userId),
    supabaseAdmin
      .from("v_holdings_valuation")
      .select("current_value, invested")
      .eq("user_id", userId),
  ]);

  // Get category names for top spend
  const categoryIds = (categoryRes.data ?? []).map((c) => c.category_id).filter(Boolean);
  const { data: categories } = categoryIds.length > 0
    ? await supabaseAdmin
        .from("categories")
        .select("id, name, color_token")
        .in("id", categoryIds)
    : { data: [] };

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
