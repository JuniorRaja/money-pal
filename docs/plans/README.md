# Money Pal — build order

Master index. Each child plan is self-contained: a fresh session should be able to read
one file plus the repo's `CLAUDE.md` and start work.

Repo: `E:\My Works\money-pal`

## Ordering principle

Nothing that learns, reports, or automates is worth building until the numbers underneath
it are correct. That puts the session/SSR fix first — not because blank pages are
annoying, but because `live()` currently returns `[]` for *any* failure, so an RLS denial
and "no data" look identical. That is the bug class that hides other bugs.

## Phases

| Phase | Window | Theme |
|---|---|---|
| 0 | Aug 15–17 (this weekend) | Make the data trustworthy |
| 1 | Aug 18–22 | Import stops being dumb |
| 2 | Aug 23–31 | Prove the maths, then deploy |
| 3 | Sept 1–14 | The daily-use layer |
| 4 | Mid-Sept | Let people in |
| 5 | Ongoing | AI depth, positioning |

## Child plans

### Phase 1 — import intelligence
- [P1-0](P1-0-design-system.md) — Design system + UI polish (Impeccable). **Part A here, Part B after P2-4**
- [P1-3](P1-3-merchant-and-mapping-memory.md) — Merchant extraction quality + per-bank mapping memory

### Phase 2 — validation and deploy
- [P2-4](P2-4-deploy.md) — Hosting-agnostic build and deploy

### Phase 3 — daily-use layer
- [P3-3](P3-3-notifications.md) — Telegram notifications + monthly email report

### Phase 4 — let people in
- [P4-1](P4-1-multi-user-hardening.md) — Multi-user hardening (before any invite)
- [P4-2](P4-2-gmail-inbound.md) — Gmail via inbound webhook
- [P4-3](P4-3-self-host.md) — Self-host path (fork → actions → live)
- [P4-4](P4-4-docs-page.md) — User docs page with screenshots

### Phase 5 — ongoing
- [P5-0](P5-0-ai-roadmap.md) — **AI roadmap**: staged plan, gates, and what never gets built
- [P5-1](P5-1-ai-category-suggestion.md) — AI category suggestion for unknown merchants (AI stage 1)
- [P5-2](P5-2-competitive-research.md) — Competitive research (CRED, Jupiter, Fi, INDmoney)

https://freedium-mirror.cfd/https://uxplanet.org/complex-animated-effects-design-in-claude-code-b5cae7010b20
https://github.com/greensock/gsap-skills

## Coverage of the original brainstorm

Every point from the brief, and where it landed. Three were answered with an argument for
doing something different — those are marked and the reasoning is in the linked plan.

| Idea | Plan |
|---|---|
| Auto-categorization learns from patterns and UPI ids | P1-2, P1-3, P5-1 |
| Regex system learns new narration formats | P1-3 — **reframed** as column-mapping memory |
| Human upserts/approves the learnings | P1-2 |
| Recent imports sub-page, card at ~2/3 width | P0-4 |
| csv + pdf of same period must dedupe | P0-3 |
| SSR shows data only after clicking Overview | P0-1 |
| Investments: stocks, MF, gold, land + free price APIs | P3-4 |
| Timeline of events/alerts, distinct from transactions | P3-1 |
| Ctrl+K search as its own task | P1-4 |
| Browser-run AI for PDF OCR and file reading | P1-1 + P5-1 — **declined**, see below |
| Host on Vercel with Supabase | P2-4 |
| Gmail import, auto-read incoming mail | P4-2 |
| Easy setup for non-technical friends | P4-3, P4-1 |
| Notifications: in-app, push, Telegram, mail reports | P3-3 — **push deprioritized**, P3-1 |
| AI implemented slowly, step by step | **P5-0** |
| E2E test plan with Playwright MCP for calculations | P2-1, P2-2 |
| Understanding doc with screenshots | P4-4 |
| Run Impeccable for UI polish | **P1-0** |
| Code review pass | P2-3 |
| EMI reflects in loans, CC payment links to card | P3-2 |
| Research CRED and Indian fintech moats | P5-2 |

## Corrections to the original brief

Several ideas in the brainstorm are already partly built. Verified against the code:

| Assumption | Reality |
|---|---|
| "Dedupe is missing — csv then pdf adds both" | Dedupe exists and is DB-enforced three ways, including a unique index `ux_txn_external`. The failure is the **hash input** (`src/lib/import/hash.ts:19` normalizes narration by whitespace + uppercase only), so the same transaction worded differently hashes differently. See P0-3. |
| "I uploaded a PDF" | **There is no PDF parsing in this repo.** Papaparse + `xlsx` only; the PDF tile is `soon`. The file was converted externally, which caused the narration drift above. See P1-1. |
| "Build a system that learns from UPI ids and categories" | ~60% built. `import_rules` exists and `src/components/import/review-deck.tsx:201-209` already writes a merchant→category rule when you change a suggestion. Missing: a UI, and stable merchant extraction. See P1-2, P1-3. |
| "Plan to implement investments / timeline" | Both routes, tables and views already exist. Investments lacks pricing; timeline lacks anything that writes events. See P3-4, P3-1. |
| "CC payment can be linked to CC" | `credit_card_cycles.amount_paid` is a hand-typed stored column — that is why payments never show against the card. Deriving it in the view is most of this bullet. See P3-2. |

## Two things deliberately not being built

**In-browser LLM for parsing/OCR.** Bank statement PDFs carry a real text layer, so
`pdf.js` handles extraction with no model. The genuinely hard part — reconstructing table
rows from positioned spans — is what small in-browser models are worst at. For
categorisation, `import_rules` beats an LLM on your data because your merchants repeat:
after two statements a deterministic lookup has high coverage, instantly, offline, with
no 500MB–2GB download on an app non-technical friends are meant to install easily.
Server-side Claude already exists for the genuine tail (P5-1). Revisit only if scanned
statements become a real need.

**Auto-learned narration regex.** Inferring regexes from examples fails in the direction
that hurts most: a wrong learned pattern silently mis-parses an amount and you find out
when a balance is wrong. What is experienced as "a new format" is a new *column layout*,
already solved by `import_profiles` — which has a real key bug fixed in P1-3.

## Standing rules for every child plan

- `docs/DECISIONS.md` is authoritative. If work contradicts it, record a new decision —
  do not silently diverge. P0-3 and P3-2 each need a new entry.
- Money is `Paise`, integer minor units. Never floats.
- Balances, budget `spent`, goal `saved`, net worth are **derived**. Never stored.
- Dates: always `dayKey()` from `src/lib/money.ts`, never `slice(0,10)` (DECISIONS #15).
- Reads go through `src/data/repository.ts` → `src/data/live.ts`. Writes go through
  `src/lib/mutations.functions.ts`.
- `npm run test:unit` lists its four files **explicitly with no glob** — a new test file
  must be added to the script or it silently never runs.
