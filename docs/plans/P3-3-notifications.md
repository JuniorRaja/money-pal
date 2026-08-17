# P3-3 — Notifications: Telegram first, email reports second

**Phase:** 3 · **Depends on:** P3-1 (the feed is the source), P2-4 (needs a deployed host
with cron)

## Status

- **Telegram — complete.** `notification_channels` migration is live. Settings →
  Notifications has token/chat-id/enable, a test-send, and a manual "send digest now".
  Daily cron automation is configured via Nitro scheduled tasks on Cloudflare Workers.
- **Email reports — complete.** SMTP-style config UI in Settings, HTTP-based email
  sending via Resend/SMTP2GO, monthly report formatter, and cron automation.
- **Automation (cron)** — fully configured via `nitro.config.ts` → Cloudflare Cron Triggers.

## Why the order is not the order you listed

You asked for in-app, push, Telegram, and email reports. Ranked by cost-to-value rather
than by list order:

1. **In-app** — already done by [P3-1](P3-1-timeline-derived-feed.md). The bell renders the
   derived feed. Zero extra infrastructure.
2. **Telegram** — one HTTPS POST to the Bot API. No APNs, no FCM, no VAPID keys, no service
   worker, no store review, no permission prompt, and it works on every device you own
   including desktop. Setup for a friend is "message @BotFather, paste a token" — genuinely
   non-technical.
3. **Email reports** — a monthly cron rendering aggregates `getAssistantContext()`
   (`src/data/repository.ts:353`) already computes. Uses HTTP-based providers (Resend,
   SMTP2GO) since Cloudflare Workers cannot make raw SMTP connections.
4. **Web push — last, or never.** Service worker + VAPID keys + a permission prompt users
   decline, to deliver exactly what Telegram already delivers. Build it only if someone
   without Telegram actually asks.

## Telegram

- **Setup:** user creates a bot via @BotFather, pastes the token; the app resolves their
  chat id on first `/start`. Store token and chat id per user.
- **Security:** the bot token is a credential — store it server-side only, never in a
  `VITE_*` var (those are inlined into the client bundle at build time).
- **Send:** a serverFn posting to `api.telegram.org/bot<token>/sendMessage`. No SDK needed;
  it's one `fetch`.
- **Trigger:** a daily cron at 02:00 UTC (07:30 IST) reading the timeline_events table and
  sending anything new since `last_digest_sent_at`.
- **Rate:** one digest per day, not one message per event. A finance app that buzzes gets
  muted, and a muted channel is worse than no channel.

## Email reports

- **Provider:** HTTP-based email APIs since Cloudflare Workers cannot make raw TCP/TLS
  connections. Supported providers:
  - **Resend** (recommended): host=`smtp.resend.com`, pass=API key
  - **SMTP2GO**: host=`mail.smtp2go.com`, pass=API key
- **Content:** the monthly rollup — income, expense, net, top categories, budget outcomes,
  goal progress, holdings summary. All from `v_monthly_cashflow`, `v_category_spend`,
  `v_budget_progress`, `v_goal_progress`, `v_holdings_valuation`.
- **Trigger:** monthly cron on 1st at 06:00 UTC (11:30 IST), reports on the previous month.
- **Send to yourself first for a month before sending to anyone else.**

## Files

### Database
- `supabase/migrations/20260816110000_notification_channels.sql` — per-user channel config
  (Telegram fields). **Done.**
- `supabase/migrations/20260817080000_email_notification_columns.sql` — email fields added
  to notification_channels (email_enabled, smtp_host, smtp_port, smtp_user, smtp_pass,
  smtp_from, last_email_sent_at). **Done.**

### Backend
- `src/lib/notify.functions.ts` — Telegram and email send functions. **Done.**
  - `sendTelegramTestFn` — test connection
  - `sendTelegramDigestFn` — manual digest send
  - `sendEmailTestFn` — test email configuration
  - `sendMonthlyEmailFn` — manual monthly report send
- `src/lib/notify-digest.ts` — pure Telegram digest formatter, unit-tested. **Done.**
- `src/lib/notify-email.ts` — pure email report formatter (HTML + plain text). **Done.**
- `src/lib/email.server.ts` — HTTP-based email sending infrastructure. **Done.**
- `src/lib/mutations.functions.ts` — `saveNotificationChannelFn` extended for email. **Done.**

### Cron Tasks
- `tasks/telegram-digest.ts` — daily Telegram digest fan-out to all enabled users. **Done.**
- `tasks/email-report.ts` — monthly email report fan-out to all enabled users. **Done.**
- `nitro.config.ts` — task registration and cron schedules. **Done.**
  - `telegram:digest` at `0 2 * * *` (02:00 UTC = 07:30 IST daily)
  - `email:report` at `0 6 1 * *` (06:00 UTC = 11:30 IST on 1st of month)

### Frontend
- `src/routes/settings.tsx` — Notifications tab with Telegram and Email panels. **Done.**
- `src/data/schema.ts` — `NotificationChannel` type extended for email. **Done.**
- `src/data/live.ts` — `liveNotificationChannel` fetches email columns. **Done.**

## Cron Schedule Summary

| Task | Cron | UTC | IST | Description |
|------|------|-----|-----|-------------|
| `prices:refresh` | `0 19 * * *` | 19:00 | 00:30 | Daily market prices |
| `telegram:digest` | `0 2 * * *` | 02:00 | 07:30 | Daily Telegram digest |
| `email:report` | `0 6 1 * *` | 06:00 (1st) | 11:30 (1st) | Monthly email report |

## Done when

- [x] Telegram digest sends on demand, with real events from your ledger, tested against a
      real bot and a real chat id.
- [x] The Telegram digest arrives on its own, daily, with no manual click.
- [x] A monthly email report arrives with numbers matching the app.
- [x] Telegram is per-user configurable and can be turned off.
- [x] Email is per-user configurable and can be turned off.
- [x] Nothing sends when there is nothing to say (both Telegram and email skip empty periods).

## Out of scope

Web push. Real-time/instant alerts — daily digest first; add urgency only where it earns
itself (a card due tomorrow, maybe).
