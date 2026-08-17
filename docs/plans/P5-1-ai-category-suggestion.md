# P5-1 — AI category suggestion for unknown merchants

**Phase:** 5 · **AI stage 3** ([P5-0](P5-0-ai-roadmap.md)) · **Depends on:** P1-2, P1-3
(rules must be good first — AI fills the tail, it does not replace the head), plus AI
stage 1 (provider config, quota, usage log) and stage 2 signal 8 (`pg_trgm` merchant
clustering — collapse `AMZN MKTPLACE` / `Amazon Pay` before paying a model to read both)

## Why this is the right AI step, and the browser-LLM idea is not

You asked about running a model in the browser for parsing and categorisation. The
categorisation half has a much cheaper answer that already exists.

`import_rules` beats an LLM on *your* data because your merchants repeat. After two
statements a deterministic lookup covers most rows — instantly, offline, with no model
download, and it is auditable and correctable ([P1-2](P1-2-rules-management-ui.md)). An
in-browser model would be slower, larger, less accurate on Indian bank narrations, and
would put a 500MB–2GB download in front of the non-technical friends you want to onboard
easily.

What rules *cannot* do is the first encounter with a merchant you have never seen. That is
the tail, and that is what this plan covers — server-side, using the assistant that already
exists.

## Current state (verified)

`src/lib/assistant.functions.ts` — one serverFn, `askAssistant`. Provider by env
(`ANTHROPIC_API_KEY` → direct Claude API, else `OPENROUTER_API_KEY`). Correctly scoped: it
receives only the 7-line aggregate digest from `getAssistantContext()`
(`src/data/repository.ts:291-321`) — no merchant names, no account numbers, no rows. No
tools, no streaming, one shot.

`heuristics.ts` falls to `confidence: 0.4` when a merchant is extracted but no keyword rule
matches, and `0.2` when nothing is found. Those rows are exactly the candidates.

## Approach

At the end of staging, collect merchants that matched **no** rule and **no** keyword. Send
that list — **merchant name strings only** — in one request, get back suggested categories,
attach them as suggestions with a visible "suggested by AI" marker and a confidence below
the `IMPORT_LOW_CONFIDENCE_MAX` (0.8) threshold so they always land in review.

## Privacy — the line that matters

Send **merchant strings only**. No amounts, no dates, no account names, no balances, no
transaction rows. A list of merchant names is roughly what a bank statement's payee column
would reveal and nothing more.

This is a deliberate widening of the current contract (which sends aggregates only), so:
- Record it in `docs/DECISIONS.md`.
- Make it **opt-in**, reusing the existing `assistant_context` setting pattern in
  `src/routes/settings.tsx` — do not silently reuse the existing toggle's consent for a
  different kind of data.
- One request per import, not per row.

## Files

- `src/lib/assistant.functions.ts` — a `suggestCategories(merchants: string[])` serverFn.
- `src/lib/import/stage.ts` — call it for the unmatched set after `applyImportRules`.
- `src/components/import/review-deck.tsx` — mark AI-suggested categories distinctly from
  rule-driven ones.
- `src/routes/settings.tsx` — the opt-in.

## Done when

- Importing a statement full of unfamiliar merchants produces useful suggestions.
- Every AI suggestion goes through review — none auto-commits.
- Accepting one writes a normal `import_rule`, so **the same merchant never needs the AI
  again**. This is the point: the AI seeds the deterministic system, it doesn't become a
  dependency.
- Turning the setting off sends nothing.

## Out of scope

AI parsing of statement structure. Any AI in the write path. Streaming.
