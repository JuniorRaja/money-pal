# CLAUDE.md

## Commands

```bash
npm run dev         # :3000
npm run build
npm run lint
npm run format
npm run test:unit   # tsx --test, import pipeline only
npm run test:e2e    # playwright (starts/reuses the dev server)
```

## Stack

TanStack Start (file-based routing, SSR) + React 19 + Supabase (Postgres, auth, RLS) + Tailwind v4 +
shadcn/Radix + TanStack Query + RHF + Zod + Recharts. nitro → Cloudflare module on build.

## Rules

- Money is `Paise` — integer minor units. Never floats. See `src/data/schema.ts`.
- Balances, budget `spent`, goal `saved`, net worth are **derived** from transactions. Never stored.
- Reads go through `src/data/repository.ts` (→ `src/data/live.ts`). No component queries Supabase directly.
- Writes go through `src/lib/mutations.functions.ts` (`createServerFn` → Postgres RPCs, for ledger correctness).
- Routing is TanStack file-based (`src/routes/README.md`). No `src/pages/`, no Next/Remix conventions.
- `supabase/migrations/` is the live schema, applied in filename order. Progress comes from SQL views
  (`v_budget_progress`, `v_category_spend`, `v_goal_progress`), not columns.

## Docs

- `docs/DECISIONS.md` — authoritative for settled product rules. Read before touching budget, goal,
  or import behavior. When it disagrees with code, it wins until a new decision is recorded.
- `docs/PRD.md` — domain vocabulary and product intent **only**. Its stack (Next.js, Drizzle, Neon,
  Better Auth) was never built; ignore all stack and file-layout claims in it.

## Labels / Slices

One real account balance splits into named owned/custodial/earmarked slices — so money held for
someone else can be excluded from net worth. Called **Labels** in schema and PRD, **Slices** in
UI/type code; same thing. `SliceKind` + `Slice` in `src/data/schema.ts`; invariants I1/I2 in PRD.

## Import pipeline

Client-side only — the statement file is never uploaded. `src/lib/import/`:

`parse.ts` → `map.ts`/`presets.ts` (per-bank columns) → `normalize.ts` → `hash.ts` (dedupe; formula
in DECISIONS.md) → `heuristics.ts` (merchant categorization) → `stage.ts` → review UI in
`src/routes/imports/`. Plus `match-accounts.ts` (account matching) and `pending-file.ts` (resumable
uploads).

## AI assistant

`src/lib/assistant.functions.ts`. Provider picked by env: `ANTHROPIC_API_KEY` (direct Claude API)
else `OPENROUTER_API_KEY`. Only ever receives computed aggregates via `getAssistantContext()` —
never raw transaction rows.
