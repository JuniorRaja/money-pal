# P3-3 — Notifications: Telegram first, email reports second

**Phase:** 3 · **Depends on:** P3-1 (the feed is the source), P2-4 (needs a deployed host
with cron)

## Status

- **Telegram — built and verified.** `notification_channels` migration is live. Settings →
  Notifications has token/chat-id/enable, a test-send, and a manual "send digest now". All
  four confirmed working end to end against the real DB and the real Telegram API (test
  message round-tripped Telegram's own `Unauthorized` for a bad token; a real token sent
  successfully). What's missing is *automatic* daily sending — nothing schedules it yet.
- **Email reports — not started.** Design below, no code, no Resend account.
- **Automation for both (cron)** is blocked on [P2-4](P2-4-deploy.md) — no host chosen yet
  means no cron primitive to schedule against. See "Deferred" at the bottom. This is being
  picked up as its own discussion, not folded into this pass.

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
   (`src/data/repository.ts:353`) already computes. Needs a sending provider.
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
- **Trigger:** a daily cron reading P3-1's derived feed and sending anything new since
  `last_digest_sent_at`. Cron mechanism depends on the host chosen in P2-4 — see "Action
  items" below for what's built vs. what's still needed once a host exists.
- **Rate:** one digest per day, not one message per event. A finance app that buzzes gets
  muted, and a muted channel is worse than no channel.

## Email reports

- Provider: Resend is the straightforward choice and pairs with P4-2's inbound webhook if
  you go that route — one vendor instead of two.
- Content: the monthly rollup — income, expense, net, top categories, budget outcomes, goal
  progress. All of it already exists in `v_monthly_cashflow`, `v_category_spend`,
  `v_budget_progress`, `v_goal_progress` — the same views `getAssistantContext()`
  (`src/data/repository.ts:353`) already reads, so no new aggregation logic is needed.
- **Send to yourself first for a month before sending to anyone else.**

## Files

- `supabase/migrations/20260816110000_notification_channels.sql` — per-user channel config.
  **Done.** Extend with `email_enabled` when email is built (see below) rather than adding
  it speculatively now.
- `src/lib/notify.functions.ts` — Telegram send functions. **Done** (`sendTelegramTestFn`,
  `sendTelegramDigestFn`). Email send function goes here too.
- `src/lib/notify-digest.ts` — pure digest formatter, unit-tested. **Done.**
- `src/routes/settings.tsx` — Notifications tab. **Done** for Telegram; Email panel is
  currently a placeholder.
- Host cron config — **not started**, blocked on P2-4.

## Action items — Digests (Telegram)

Getting from "works when I click the button" to "arrives every morning on its own":

1. **Cron trigger.** Nothing to build until [P2-4](P2-4-deploy.md) picks a host — the
   primitive differs by host (Vercel Cron, Cloudflare Cron Trigger, a scheduled GH Action).
   Once decided, schedule a daily call that reaches every user with `telegram_enabled =
   true`. **Blocked — parked for the hosting discussion.**
2. **Multi-user fan-out.** `sendTelegramDigestFn` currently runs for the *authenticated
   caller only* — it reads `context.userId` off the request via `requireSupabaseAuth`. A
   cron job has no logged-in user, so it needs a service-role variant that loops every
   enabled row in `notification_channels` instead. Real code, not just scheduling — write it
   alongside the cron wiring in step 1, once a host exists to test it against.
3. **Digest window on first send.** With no `last_digest_sent_at` yet, the window falls back
   to "last 24h" (`src/lib/notify.functions.ts`). Enabling Telegram after weeks of
   inactivity gives a small first digest, not a backfill of everything missed. Confirmed
   intentional — flagging here so it isn't "fixed" into a backfill by accident later.
4. **Quiet hours.** `/timeline` says "Money Pal holds non-urgent notices between 10 PM and
   8 AM" — copy only, nothing enforces it today. A once-a-day digest already avoids buzzing
   at 2am, so this only matters if a same-day/urgent channel gets added later (explicitly
   out of scope below). Skip until that happens.

## Action items — Summaries (Email)

Nothing built yet. In order:

1. **Provision Resend.** Create the account, get `RESEND_API_KEY`, verify a sending domain
   (or use Resend's test domain while honoring "send to yourself first").
2. **Migration.** Add `email_enabled boolean not null default false` to
   `notification_channels`. The address itself is already on `auth.users` — don't duplicate
   it onto this table.
3. **Content function.** A pure formatter, same shape as `notify-digest.ts` — built from
   `v_monthly_cashflow`, `v_category_spend`, `v_budget_progress`, `v_goal_progress`.
   Unit-testable the same way `notify-digest.test.ts` is.
4. **Send function.** `sendMonthlyEmailFn` in `notify.functions.ts`, gated on
   `RESEND_API_KEY` the same way `assistant.functions.ts` gates on `ANTHROPIC_API_KEY` /
   `OPENROUTER_API_KEY` — a clear "not configured" error if the key is missing, not a
   silent no-op.
5. **Settings UI.** Un-stub the "Email reports" panel: an enable toggle plus a "send this
   month's report to me now" button, mirroring the Telegram test-send pattern already built.
6. **Cron trigger.** Same story as Telegram step 1 — monthly instead of daily, same host
   dependency. **Blocked — parked for the hosting discussion.**

## Deferred — hosting & cron

Both digest automation and the email cron trigger need [P2-4](P2-4-deploy.md) settled
first — everything else above is buildable without it. This is being picked up separately,
not resolved as part of this pass.

## Done when

- [x] Telegram digest sends on demand, with real events from your ledger, tested against a
      real bot and a real chat id.
- [ ] The Telegram digest arrives on its own, daily, with no manual click — needs P2-4 +
      Action items 1–2 above.
- [ ] A monthly email report arrives with numbers matching the app — needs Action items 1–6
      above.
- [x] Telegram is per-user configurable and can be turned off.
- [ ] Email is per-user configurable and can be turned off — needs email built first.
- [x] Nothing sends when there is nothing to say (Telegram digest; verified via
      `notify-digest.test.ts`'s empty-events case).

## Out of scope

Web push. Real-time/instant alerts — daily digest first; add urgency only where it earns
itself (a card due tomorrow, maybe).
