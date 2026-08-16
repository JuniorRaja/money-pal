/**
 * Telegram send functions.
 *
 * One HTTPS POST to the Bot API — no SDK. Email reports are a separate,
 * not-yet-built line item (see docs/plans/P3-3-notifications.md).
 */
import { createServerFn } from "@tanstack/react-start";

import { getTimelineEvents } from "@/data/repository";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatTelegramDigest } from "@/lib/notify-digest";

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
