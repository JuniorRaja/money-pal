import { defineTask } from "nitro/task";

import { formatTelegramDigest } from "@/lib/notify-digest";

const DAY_MS = 86_400_000;

/**
 * P3-3 — daily Telegram digest. Scheduled from nitro.config.ts onto a Cloudflare
 * cron trigger at 02:00 UTC (07:30 IST).
 *
 * Fans out to every user with telegram_enabled = true. Uses supabaseAdmin to
 * bypass RLS — there is no authenticated user in a cron context.
 */
export default defineTask({
  meta: {
    name: "telegram:digest",
    description: "Send daily Telegram digest to all enabled users",
  },
  async run() {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Find all users with Telegram enabled
    const { data: channels, error: channelsError } = await supabaseAdmin
      .from("notification_channels")
      .select("user_id, telegram_bot_token, telegram_chat_id, last_digest_sent_at")
      .eq("telegram_enabled", true)
      .is("deleted_at", null);

    if (channelsError) throw channelsError;
    if (!channels?.length) {
      console.log("[telegram:digest] No users with Telegram enabled");
      return { result: { sent: 0, skipped: 0, failed: 0 } };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const channel of channels) {
      if (!channel.telegram_bot_token || !channel.telegram_chat_id) {
        skipped++;
        continue;
      }

      try {
        // 2. Fetch timeline events for this user (bypassing RLS with admin client)
        const since = channel.last_digest_sent_at
          ? Date.parse(channel.last_digest_sent_at)
          : Date.now() - DAY_MS;

        const { data: events, error: eventsError } = await supabaseAdmin
          .from("timeline_events")
          .select("id, occurred_at, kind, title, detail, amount, account_id, action_label")
          .eq("user_id", channel.user_id)
          .gt("occurred_at", new Date(since).toISOString())
          .order("occurred_at", { ascending: true })
          .limit(200);

        if (eventsError) {
          console.error(`[telegram:digest] Failed to fetch events for ${channel.user_id}:`, eventsError);
          failed++;
          continue;
        }

        const formatted = (events ?? []).map((e) => ({
          id: e.id,
          occurred_at: e.occurred_at,
          kind: e.kind as "money" | "ai_insight" | "goal" | "bill" | "system",
          title: e.title,
          detail: e.detail ?? "",
          amount: e.amount === null ? null : Number(e.amount),
          account_id: e.account_id,
          action_label: e.action_label,
        }));

        const text = formatTelegramDigest(formatted);
        if (!text) {
          // Nothing to say — update timestamp anyway to avoid re-checking the same window
          await supabaseAdmin
            .from("notification_channels")
            .update({ last_digest_sent_at: new Date().toISOString() })
            .eq("user_id", channel.user_id);
          skipped++;
          continue;
        }

        // 3. Send the message
        const res = await fetch(
          `https://api.telegram.org/bot${channel.telegram_bot_token}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: channel.telegram_chat_id, text }),
          }
        );

        if (!res.ok) {
          const payload = await res.json().catch(() => ({})) as { description?: string };
          console.error(
            `[telegram:digest] Telegram rejected message for ${channel.user_id}:`,
            payload.description ?? res.status
          );
          failed++;
          continue;
        }

        // 4. Update last_digest_sent_at
        const { error: updateError } = await supabaseAdmin
          .from("notification_channels")
          .update({ last_digest_sent_at: new Date().toISOString() })
          .eq("user_id", channel.user_id);

        if (updateError) {
          console.error(`[telegram:digest] Failed to update timestamp for ${channel.user_id}:`, updateError);
        }

        sent++;
      } catch (e) {
        console.error(`[telegram:digest] Unexpected error for ${channel.user_id}:`, e);
        failed++;
      }
    }

    console.log(`[telegram:digest] sent=${sent} skipped=${skipped} failed=${failed}`);
    return { result: { sent, skipped, failed } };
  },
});
