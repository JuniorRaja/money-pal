# Product

## Platform

Web (mobile-first, 375px+)

## Stack

TanStack Start (file-based routing, SSR) · React 19 · Supabase (Postgres, auth, RLS) · Tailwind v4 ·
shadcn/Radix · TanStack Query · React Hook Form · Zod · Recharts. Deployed to Cloudflare Workers via
Nitro.

## Users

**Primary:** Prasanna (creator), personal use tracking money split across named slices.
**Secondary:** Non-technical people who need to track custodial or shared money held in their
accounts (parents' funds, trip money, funds held for others) — they currently use spreadsheets
because no app models their reality.

## Product Purpose

A personal finance app whose defining feature is **Slices** — splitting one real bank account
balance into named funds so ownership is tracked correctly. ₹77,000 in HDFC is not one number: it
is ₹50,000 held for Mom, ₹20,000 personal, ₹7,000 emergency reserve. A transaction can draw from
multiple slices at once. Net worth counts only what is owned, excluding custodial funds.

## Positioning

Every other finance app forces a choice between fake accounts (pretending a single balance is
multiple) and lying about net worth. Money Mate models reality: one real bank account, multiple
named ownership slices, correct balances by construction. The ledger is append-only, slices cannot
drift, and net worth accounts for what is genuinely yours.

## What's Live

- **Accounts** — multi-account with slices (owned/custodial/earmark), balance derivation
- **Transactions** — CRUD, category assignment, split across slices, transfers
- **Budgets** — monthly planning, 50/30/20 template, progress derived from transactions
- **Goals** — contributions, progress tracking, optional transaction links
- **Credit Cards** — cycles, amount_paid derived from transfers
- **Import Center** — CSV/Excel/PDF parsing (browser-side), bank presets (HDFC, DBS), dedupe,
  review deck (card + table), import rules with merchant→category learning
- **Notifications** — Telegram daily digest, email monthly reports, per-user config
- **AI Assistant** — chat with Claude/OpenRouter, receives aggregates only
- **Reports** — period comparison stats, real deltas, empty states for new users

## What's Half-Baked

- **Investments** — holdings table and price task work; portfolio trend is mock data, no CRUD UI
- **Timeline** — route exists but nothing writes events yet

## What's Planned

See `docs/plans/README.md` for the roadmap. Key pending items:
- P1-3: Merchant extraction + mapping memory fix
- P5-1: AI category suggestions for unknown merchants

## Technical Constraints

- Money is `bigint` paise (integer minor units). Never floats.
- Balances, budget progress, goal progress, net worth are **derived** from transactions via SQL
  views. Never stored, never cached client-side.
- Reads go through `src/data/repository.ts` → `src/data/live.ts`
- Writes go through `src/lib/mutations.functions.ts` (Postgres RPCs)
- Entries are append-only (corrections insert reversing set + new one)
- Dates use `dayKey()` from `lib/money.ts`, never string slicing (IST timezone handling)
- `DECISIONS.md` is authoritative for settled product rules

## Product Principles

1. **Model reality, not convention.** Accounts split by ownership, not fake silos. Net worth
   excludes what is not yours.
2. **Correctness first.** Append-only ledger, deferrable constraint triggers, RLS on every query.
   Balances derive from entries; nothing is reconciled.
3. **Slices are the core.** Every design decision returns to: does this make slices clearer, or
   does it obscure the split?
4. **Client-side import.** Statements are parsed in the browser and discarded. Raw files never
   reach the server.
5. **Derived, never cached.** Every displayed figure is a fresh `SUM` with a different WHERE clause.

## Accessibility & Inclusion

Mobile viewport (375px+) is primary; desktop is a refinement. Dark and light mode. WCAG standards.
Indian users are the first audience (language, bank names, IST timezone); the app is in English.
