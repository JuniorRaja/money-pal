# Money Mate — Personal Finance OS

A premium, agency-grade finance web app matching the uploaded Money Mate screens: warm antique-gold + cream palette, editorial serif headings, watermarked mountain/landscape line artwork, soft cards, and restrained micro-interactions.

## Design direction

- Palette: cream/parchment surfaces (`#faf8f5`, `#f0ebe3`), antique gold accent (`#b3803f`), deep espresso text; full dark mode (warm charcoal `#211d19`) as shown in the Transactions dark screenshot.
- Type: editorial serif for page titles (Instrument Serif / Cormorant feel), clean sans for UI and tabular numerals for money.
- Signature element: every page gets its OWN watermark artwork, all drawn from one shared visual language (thin gold linework, layered silhouettes, sun disc, topographic contours, faint dot markers, low-opacity fade). Examples: Overview = sun over dunes; Accounts = mountain range; Transactions = flowing river lines; Timeline = horizon path with milestone dots; Budgets = terraced fields; Goals = summit flag; Investments = rising ridgeline; Reports = contour map; Assistant = constellation; Import Center = bridge/arches; Settings = concentric rings. Plus subtle grain/pattern texture on surfaces.
- Micro-interactions: hover lift on cards, animated sparkline draw-in, progress/donut arcs animating on mount, staggered row fade-ins, spring-y toggles and tab pills, slide-in detail panels. All respect a "Reduce motion" setting.

## Navigation

Persistent left sidebar with the `M` logo, grouped exactly as requested:

- Money: Overview, Accounts, Transactions, Timeline
- Plan: Budgets, Goals, Investments, Reports
- Workshop: AI Assistant, Import Center, Settings

Top bar on each page: command-style search, "Ask Money Mate" button, notifications, theme toggle.

## Pages

- Overview — net worth hero with animated chart, cash/investments/liabilities tiles, recent activity, AI insight card, upcoming bills.
- Accounts — totals row, Cash & Bank cards with mini sparklines, Credit Cards with utilisation rings and Pay Now, Investments group.
- Transactions — filter bar (date, account, category, label, type), summary strip with dual sparkline, grouped-by-day table, and a slide-in detail panel with Details / Notes & Attachments tabs.
- Timeline — event feed with category tabs (All, Money, AI Insights, Goals, Bills, System), coloured dots and per-day grouping.
- Budgets — month/quarter/year switcher, planned/spent/remaining/savings-rate stats, donut overview with legend, category budget table with progress bars, insight card, budget-vs-last-month bars, overspending alerts.
- Goals — goal cards with circular progress, target dates, contribution history.
- Investments — holdings by asset class, allocation donut, performance chart, gainers/losers.
- Reports — period selector, income vs expense chart, category breakdown, cash-flow trend, export actions.
- AI Assistant — full chat surface with streaming responses, markdown rendering, suggested prompts grounded in the user's finance data.
- Import Center — Gmail / PDF / CSV / Manual source cards, live parsing progress, "Waiting for you" review queue, recent imports.
- Settings — Appearance, Money, Assistant, Data & privacy, Imports sections with the row-based control layout from the screenshots.

## Technical notes

- TanStack Start file routes: `/`, `/accounts`, `/transactions`, `/timeline`, `/budgets`, `/goals`, `/investments`, `/reports`, `/assistant`, `/imports`, `/settings`, each with its own SEO head metadata.
- Design tokens defined in `src/styles.css` (`@theme inline`, oklch) — no hardcoded colours in components.
- Charts with Recharts; motion with Motion for React; watermark artwork as hand-authored inline SVG components (no raster images).
- Data: a clean, backend-shaped mock layer designed for a later PostgreSQL swap:
  - `src/data/schema.ts` — normalised, relational types with real ids and foreign keys (`accounts`, `transactions`, `categories`, `labels`, `budgets`, `goals`, `holdings`, `timeline_events`, `imports`, `settings`), snake-case-mappable field names, ISO date strings, integer minor-units for money.
  - `src/data/seed/*.ts` — pure data files, one per table, nothing else.
  - `src/data/repository.ts` — the ONLY thing UI imports: async functions (`listTransactions(filter)`, `getAccounts()`, `getBudgets(period)`, …) that today read from seed arrays and later become server functions hitting Postgres. No component touches raw seed data.
- AI Assistant: streaming AI via Lovable AI (`openai/gpt-5.6-sol`) through a server route. Cost is kept low by request design, not by swapping models: low reasoning effort, a compact pre-summarised finance context instead of raw rows, short prompt-stated answer limits, and no background/auto calls. Requires enabling Lovable Cloud for the API key.

## Assumptions

- Desktop-only layout (min ~1280px); no mobile/responsive breakpoints.
- Mock login flow, no real backend auth: passphrase unlock screen (as in the screenshot) → 2FA code step (any 6 digits accepted) → app. Also offers a "Use Touch ID" mock shortcut. Unlock state kept client-side for the session.
- Single demo user (Arav Mehta), INR currency.
- Data is mock/local; no database persistence until the Postgres swap.
