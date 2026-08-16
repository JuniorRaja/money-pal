/**
 * Formats timeline events into a Telegram digest message. Pure and framework-free
 * so it can run under `tsx --test` without pulling in server-fn machinery.
 */
import type { TimelineEvent } from "../data/schema";

/** One digest per day, so a long quiet stretch shouldn't produce a wall of text. */
const DIGEST_MAX_EVENTS = 15;

/** Empty string means "nothing to say" — the caller skips sending. */
export function formatTelegramDigest(events: TimelineEvent[]): string {
  if (events.length === 0) return "";

  const sorted = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const shown = sorted.slice(0, DIGEST_MAX_EVENTS);
  const lines = shown.map((e) => `• ${e.title} — ${e.detail}`);
  const overflow = sorted.length - shown.length;
  if (overflow > 0) lines.push(`…and ${overflow} more in the app.`);

  return ["Money Pal — daily digest", "", ...lines].join("\n");
}
