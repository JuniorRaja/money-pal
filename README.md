# Money Pal

A personal finance workspace: accounts, transactions, budgets, goals, investments, bank-statement
import, and an AI assistant — built around one idea, that a single real account balance can be split
into owned / custodial / earmarked **slices**, so money you're merely holding for someone else never
inflates your net worth.

**Money** — Overview · Accounts · Transactions · Timeline
**Plan** — Budgets · Goals · Investments · Reports
**Workshop** — AI Assistant · Import Center · Settings

## Stack

TanStack Start (file-based routing, SSR) · React 19 · Supabase (Postgres, auth, RLS) · Tailwind v4 ·
shadcn/Radix · TanStack Query · React Hook Form · Zod · Recharts. Builds to a Cloudflare module via
nitro.

## Setup

Requires Node 22+ and a Supabase project.

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev            # http://localhost:3000
```

### Environment

| Variable                                             | Used by                 | Notes                                 |
| ---------------------------------------------------- | ----------------------- | ------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | browser                 | Vite inlines these at build time      |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`           | SSR / server functions  | same values, read at runtime          |
| `SUPABASE_SERVICE_ROLE_KEY`                          | admin-only server paths | never expose to the client            |
| `ANTHROPIC_API_KEY`                                  | AI assistant            | direct Claude API; takes precedence   |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`             | AI assistant            | fallback provider if no Anthropic key |

The assistant picks its provider from whichever key is present, and is only ever given computed
aggregates — never raw transaction rows.

### Database

Apply `supabase/migrations/` in filename order to your project. Budget, goal, and category progress
are served from SQL views, not stored columns.

## Deploy

`.github/workflows/deploy.yml` pushes migrations, builds, and deploys to Cloudflare Workers on every
push to `main` (or via manual dispatch). It needs these **9 repo secrets** (Settings → Secrets and
variables → Actions) — separate from the `.env` above, which is for local dev only. The workflow
reuses the `VITE_*` values for the unprefixed runtime vars too (same values, per the `.env.example`
comment above) — you only paste each Supabase value once:

| Secret                                                                          | Used for                    | Notes                                                              |
| -------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `SUPABASE_DB_URL`                                                                | migrations                  | **Direct** connection string (Database settings → Connection string → URI, *Direct connection*, not the pooler) — DDL needs a session connection |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | build                       | same values as `.env`; also reused as the Worker's runtime vars      |
| `SUPABASE_SERVICE_ROLE_KEY`                                                      | Worker secret                | pushed via `wrangler secret put`, never written to `wrangler.json`   |
| `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`                                       | Worker secret                | set at least one; an unset one is treated as absent, not an error    |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`                                 | deploy                      | token needs Workers Scripts edit permission                          |

**First deploy only:** if `supabase/migrations/` was ever applied by hand (dashboard/SQL editor)
before this workflow existed, `supabase db push` will try to re-run all of them and fail on the
first `create table` that already exists. Baseline it once yourself first:
`supabase migration repair --status applied <version>` for each migration already live, then let
the workflow take over from there.

Trigger the workflow manually (Actions tab → Deploy → Run workflow) the first time, rather than
pushing to `main`, so a misconfigured secret fails visibly instead of blocking a real merge.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # eslint
npm run format       # prettier --write .
npm run test:unit    # import-pipeline unit tests (tsx --test)
npm run test:e2e     # playwright
```

## Notes

- Money is always an integer number of paise. Never floats.
- Balances, budget spend, goal progress, and net worth are **derived** from transactions, never stored.
- Statement import (CSV/Excel) is parsed entirely in the browser — the file is never uploaded.
- `docs/DECISIONS.md` is the authoritative record for settled product rules.
