# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing: TanStack Start (file-based routing, SSR) + React 19 + Supabase (Postgres, auth via Better Auth, RLS) + Tailwind v4 + shadcn/Radix + TanStack Query + RHF + Zod + Recharts. Deployed to Vercel; self-hosted as Docker + Postgres.

## Users

**Primary:** Prasanna (creator), personal use tracking money split across named funds. **Secondary:** Non-technical people who need to track custodial or shared money held in their accounts (parents' funds, trip money, funds held for others) — they currently use spreadsheets because no app models their reality.

## Product Purpose

A personal finance app whose defining feature is **Labels** — splitting one real bank account balance into named funds so ownership is tracked correctly. ₹77,000 in HDFC is not one number: it is ₹50,000 held for Mom, ₹20,000 personal, ₹7,000 emergency reserve. A transaction can draw from multiple labels at once. Net worth counts only what is owned, excluding custodial funds.

Success: Track money that passes through accounts but isn't yours, and stop lying to yourself in a spreadsheet.

## Positioning

Every other finance app forces a choice between fake accounts (pretending a single balance is multiple) and lying about net worth. Money Pal models reality: one real bank account, multiple named ownership slices, correct balances by construction. The ledger is append-only, labels cannot drift, and net worth accounts for what is genuinely yours.

## Operating Context

Workflows: importing bank statements (CSV/Excel, parsed in browser), adding transactions by hand, reviewing and splitting money across labels, tracking budgets by category, and setting goals tied to named funds. Money is in Paise (integer minor units). Timezone is IST. Accounts are Indian banks (HDFC, DBS, IndusInd, Axis first).

## Capabilities and Constraints

**Live (Phases 1–6, MVP):**

- Accounts with multiple labels per account
- Transactions split across labels
- Transfers between accounts
- CSV/Excel import (HDFC, DBS, custom bank mapping)
- Category budgets (monthly, read-only over transactions)
- Goals tied to earmarked labels
- Dashboard: net worth (owned + earmark only), label overview, spend by category, activity feed

**Technical constraint:** Balances, budget progress, goal progress, and net worth are derived from entries via SQL views (`v_budget_progress`, `v_category_spend`, `v_goal_progress`). Never stored, never cached on-client. Reads go through `src/data/repository.ts` → `src/data/live.ts`. Writes go through `src/lib/mutations.functions.ts` (Postgres RPCs, for ledger correctness). Append-only entries (corrections insert a reversing set plus a new one, never update `amount_minor`).

**Deferred (Phases 7–8, post-MVP):** Gmail import, PDF import, financial health scores, investments, multi-currency, Docker self-host, encryption at rest, family sharing.

**Out of scope:** Bank API integration, P&L/balance-sheet reports, accounting ERP, tax filing, trading, invoicing.

## Brand Commitments

Design system exists in Claude Design project `money-mate` (handoff via design tokens + components). Tailwind v4 + shadcn/Radix as the implementation layer. Rupee symbol (₹) and Indian market conventions (IST, Indian bank names).

## Evidence on Hand

- `DECISIONS.md`: settled product rules (budgets, labels, import, goals)
- `docs/PRD.md`: version 2.1, the single authority
- `src/data/schema.ts`: Paise type and label kinds (OWNED, EARMARK, CUSTODIAL)
- `CLAUDE.md`: stack, dev commands, file-based routing in `src/routes/`
- Live routes: accounts, budgets, goals, transactions, imports, settings, login, assistant

## Product Principles

1. **Model reality, not convention.** Accounts split by ownership, not fake silos. Net worth excludes what is not yours.
2. **Correctness first.** Append-only ledger, deferrable constraint triggers, RLS on every query, ledger scoping explicit in every API call. Balances derive from entries; nothing is reconciled.
3. **Labels are the core.** Every design decision returns to: does this make labels clearer, or does it obscure the split?
4. **Client-side import.** Statements are parsed in the browser and discarded. Raw files never reach the server.
5. **Derived, never cached.** Every displayed figure (balance, budget progress, net worth) is a fresh `SUM` with a different WHERE clause.

## Accessibility & Inclusion

Mobile viewport (375px and up) is primary; desktop is a refinement. Dark and light mode must both be polished and correct. WCAG standards throughout. Indian users are the first audience (language, cultural context, bank names, timezone); the app is in English and designed for Indian market conventions.
