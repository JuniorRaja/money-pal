# P5-0 — AI roadmap: what gets added when, and what never does

**Phase:** 5 (but the gates start at Phase 2) · **This is a sequencing plan, not a build
plan.** Each stage is its own work item.

## The premise

> A clear plan to have AI implemented slowly step by step, cus this app needs a financial
> solid base first.

Correct, and the reason is specific: **an AI feature built on wrong numbers is worse than
no AI feature**, because it launders a bad number into a confident sentence. A blank page
makes you check. A fluent paragraph doesn't.

So every stage below has a **gate** — something that must be true before it starts.

## The shape that follows from the premise

Working through the actual insight ideas produced one result worth stating up front:
**almost none of them need a model.** Recurring-charge detection, a cashflow forecast, a
day-of-week spend split, credit-card float — these are arithmetic over a ledger you
already have, and arithmetic is testable, offline, free, and correct on the same input
every time.

That gives the layering:

- **Ledger intelligence is deterministic.** SQL and TypeScript decide *what is true* and
  *what changed*. Every number a user sees comes from here.
- **AI is a narration layer on top.** It turns an already-computed fact into a sentence,
  and handles the genuine tail — a merchant string nobody has ever seen before.

This is not a cost dodge that happens to be principled; it is the same rule the stages
below enforce anyway (*never let a model decide whether something is anomalous*), applied
one level earlier. The pleasant side effect is that the expensive layer is the thin one.

## Where you already are

Stage 0 is done, and done well. `src/lib/assistant.functions.ts` receives **only** the
7-line aggregate digest from `getAssistantContext()` (`src/data/repository.ts:353-383`) —
no merchant names, no account numbers, no transaction rows. No tools, no SQL, no writes.
The system prompt already says *"Use only the ledger digest below for numbers. If something
is not in it, say so plainly"* and refuses regulated investment advice.

Two things in it are now wrong for where this is going, and Stage 1 fixes both:

- The default model is `claude-opus-5` for a 7-line digest. That is the most expensive
  model available doing the cheapest job on the list.
- Provider selection is `ANTHROPIC_API_KEY` → else `OPENROUTER_API_KEY`, read from env at
  request time. There is no user-level configuration, no usage log, and no ceiling.

The **scoping** is the part that was right, and the roadmap protects it.

## Provider chain

Order of preference — cheap, fast and local first; the frontier models are the fallback,
not the default:

| # | Provider | Wire shape | Role |
|---|---|---|---|
| 1 | **Groq** | OpenAI-compatible | Default for classification and one-sentence narration. Fast and effectively free at this volume. |
| 2 | **OpenRouter** | OpenAI-compatible | One key, many models. The catalogue escape hatch and the current self-host path. |
| 3 | **Ollama** | OpenAI-compatible | Local. Zero cost, zero egress — **nothing leaves the machine.** The privacy-maximal self-host option. |
| 4 | **Anthropic** | Anthropic messages | Fallback for anything needing real judgement (monthly narrative, chat). |
| 5 | **OpenAI** | OpenAI-compatible | Fallback for users who already have a key. |

**Four of the five speak the same wire shape.** So `ask()` needs exactly two adapters —
`openAiCompatible(baseUrl, key, model)` and the existing `anthropic(key, model)` — not
five integrations. Adding a sixth OpenAI-compatible provider later is a row in a table, not
a code change.

Fallback is **on failure, not on quality**: try the configured provider, and on a 5xx or a
network error fall through to the next configured one. Never fall back on a refusal or a
bad answer — that hides a real problem behind a second bill.

If nothing is configured and no env key exists, **AI is off and everything else works.**
That path is the P4-3 self-host requirement and it gets a test, not a hope.

---

## The stages

### Stage 0 — Assistant over aggregates ✅ built
Chat at `/assistant`, aggregates only, opt-out via the `assistant_context` setting.

**Nothing to do** beyond the Stage 1 rewiring below. Do not add features to it before the
gates pass.

---

### Stage 1 — Provider config, quota, and the usage log
**Gate:** none — this is the enabling stage, and **no second AI feature ships before it.**

Every later stage is another caller of one `ask()`. So the controls belong in `ask()`,
once, where every caller inherits them — not per feature, where the fourth feature forgets.

**Plug-and-play from the UI.** A settings panel where the user picks a provider, pastes a
key, and optionally names a model. Storage is a new `ai_config` table, **not** columns on
`profiles` — `profiles` is client-readable and an API key must never be. The client sees a
masked view (`key_set`, `key_last4`); the key column is never selectable.

Resolution: user key → env key → **off**.

**Usage log.** An `ai_calls` row per request: feature, provider, model, input/output/cached
tokens, `cost_paise`, latency, ok/error. Money is `Paise` here like everywhere else. Both
wire shapes return usage (`usage.input_tokens` / `usage.prompt_tokens`), so one
`readUsage()` sits next to the existing `readAnswer()`. Prices live in a `const` map in
code — they change twice a year and a const is a one-line diff.

**The ceiling: 25 metered calls per month**, resolved as
`coalesce(ai_config.monthly_limit, app_config.monthly_limit, 25)` — user override on top of
an app default, and the app default lets you turn AI off for everyone without a deploy.
**Local Ollama calls are not metered** and do not count; the cap exists to bound spend and
blast radius, and a local model costs neither.

Be honest about what the cap is for: 25 chat turns on a mid-tier model is small change. What
it actually protects against is a retry loop or a bad import firing four hundred requests.

**Files:** `ai_config` + `app_config` + `ai_calls` migration; `src/lib/assistant.functions.ts`
(two adapters, quota guard, usage logging); `src/routes/settings.tsx` (the panel).

---

### Stage 2 — Derived signals: the actual intelligence, no model involved
**Gate:** [P2-1](P2-1-invariant-tests.md) green. These read the same derived values the
rest of the app does, so they inherit its correctness — and its bugs, which is why the
invariant tests come first.

Nine signals, all computed. Each is independently shippable and independently testable.

| # | Signal | How | Why it earns its place |
|---|---|---|---|
| 1 | **Recurring charges** | Cluster by merchant + amount ±5% + interval 28–31d | Nobody knows their true subscription total. Also gives free **price-creep** detection: same merchant, same cadence, amount ratcheting 199 → 249 → 299. |
| 2 | **Cashflow cliff** | Project forward from recurring in/out + EMIs + `credit_card_cycles` due dates | *"You go negative on the 23rd."* The single most useful thing this app can say, and it's a loop. |
| 3 | **Credit-card float & interest exposure** | Days between spend and payment, partial-payment detection, from `credit_card_cycles` + the transfer entries `amount_paid` is derived from | Real money, computed from data you already model properly (`ce8abea`). |
| 4 | **Day-of-week / payday heatmap** | Group discretionary spend by weekday and by days-since-credit | *"63% of your discretionary spend lands Fri–Sun."* Genuinely unseen, entirely deterministic. |
| 5 | **Cash leakage** | ATM withdrawals with no matching categorized outflow | *"₹8k/month leaves the ledger untracked."* Names the blind spot instead of silently mis-stating spend. |
| 6 | **Goal feasibility** | Current savings rate vs `v_goal_progress` target date | *"At this rate the March goal lands in August."* A statement of arithmetic — stays well clear of regulated advice. |
| 7 | **Budget re-planner** | Trailing 6-month median per category + buffer | Proposes budgets from what you actually spend, not aspirational round numbers. Median beats a model here and it's auditable. |
| 8 | **Merchant clustering** | `pg_trgm` similarity over extracted merchants | `AMZN MKTPLACE` / `Amazon Pay` / `AMAZON RETAIL IN` → one merchant. Postgres extension, zero tokens. |
| 9 | **Month structure diff** | New merchants, vanished merchants, categories that swapped rank | Not totals — *structure*. Feeds Stage 4's narration with something worth narrating. |

Two ordering notes:

- **Signal 8 comes before Stage 3.** Clustering merchant strings deterministically shrinks
  the unknown-merchant tail *before* you pay a model to look at it. Doing Stage 3 first
  means paying to categorise four spellings of Amazon.
- **Signals 1 and 9 feed Stage 4.** Build the arithmetic, then decide if a sentence on top
  is worth a call. Often it isn't — a chart of signal 1 needs no prose at all.

Surface: these are exactly the derived events [P3-1](P3-1-timeline-derived-feed.md) was
built to union in. Signals go on the timeline and the Overview, not into a new page.

---

### Stage 3 — Category suggestion for unknown merchants
**Gate:** P1-2 and P1-3 done — the deterministic rules must be good first — **plus Stage 1
and signal 8**, so the calls are metered, logged, and only fire on a genuinely unseen
merchant. **Plan:** [P5-1](P5-1-ai-category-suggestion.md).

Sends merchant name strings only, one request per import, always lands in review, and
accepting one writes a normal `import_rule` so the same merchant never needs AI again. AI
seeds the deterministic system; it does not become a dependency.

Cheap model (Groq default), structured output rather than "return only JSON" plus a parse
retry loop, one call per import rather than per row.

*Widens the data contract → needs a DECISIONS entry and a separate opt-in. **With Ollama
configured, nothing leaves the machine and the opt-in is moot** — worth saying so in the UI,
because that is a real reason for a privacy-minded self-hoster to pick it.*

---

### Stage 4 — Narration: monthly report and timeline sentences
**Gate:** Stage 2 signals shipped and trusted. **Depends on:**
[P3-3](P3-3-notifications.md) for the monthly email, [P3-1](P3-1-timeline-derived-feed.md)
for the timeline.

Two surfaces, one shared rule.

**Monthly report** — two paragraphs at the top of the email, from the same aggregates
Stage 0 already sends plus the Stage 2 month diff (signal 9). **No new data leaves the
machine.** Not latency-sensitive, so it is the one place batching is worth it.

**Timeline sentences** — `TimelineKind` already includes `"ai_insight"`; the slot exists.
When a derived event fires, attach one sentence of context. Cheap model, tight `max_tokens`.

The rule for both: **every number in the prose must also appear in the table or card below
it.** If the reader can't check it, don't say it.

And the roadmap's hardest line, restated because this is where it would be violated:
**the event is computed deterministically; the AI only explains it.** Never let a model
decide *whether* something is anomalous — that is arithmetic, and arithmetic that is wrong
silently is exactly what this roadmap is sequenced to avoid.

**Format note:** prefer an *anomaly inbox* to a chat box — one weekly card with the three
things that moved, ranked. Three sentences a week is ~12 metered calls a month, well inside
the cap, and it does the noticing for the user instead of waiting for them to think of the
question.

---

### Stage 5 — Ask-your-ledger with typed metric functions
**Gate:** everything above stable, plus [P4-1](P4-1-multi-user-hardening.md) — because this
is the first stage where a prompt could reach another user's data if RLS is wrong.

PRD §9 specifies typed metric functions — `getNetWorth`, `getCashflow`, `getLabelBalances` —
that the assistant can call, instead of receiving one static digest. Described, never built.

This is the first stage using tool calls, so it is also the first stage that needs a
provider with reliable tool-calling — which in practice means the Anthropic or OpenAI
fallback, not the cheap tier. Each function is a **whitelisted, typed, RLS-scoped** read.
The PRD's rule holds: **no LLM-generated SQL, ever.** Aggregates in, text out — the tools
just make the aggregates dynamic.

---

## Model selection, per feature

The point of Stage 1's config is that this table is a default, not a lock-in.

| Feature | Default | Fallback | Why |
|---|---|---|---|
| Category suggestion | Groq / Ollama | `claude-haiku-4-5` | Classification from short strings. |
| Timeline sentence | Groq / Ollama | `claude-haiku-4-5` | One sentence about a number you already computed. |
| Monthly narrative | `claude-sonnet-5` | — | Worth real judgement, once a month, per user. |
| Chat `/assistant` | `claude-sonnet-5` | `claude-opus-5` **on user opt-in** | Near-Opus quality; the user pays for Opus if they want it. |

Three implementation notes that will otherwise cost an afternoon each:

- `output_config: { effort: "low" }` **errors on `claude-haiku-4-5`.** The current code sends
  it unconditionally — strip it per model.
- Prompt caching has a minimum cacheable prefix (512 tokens on Opus 5, 1024 on Sonnet 5,
  4096 on Haiku 4.5). These prompts are ~200 tokens, so caching will silently never fire.
  Don't wire it until a prompt is genuinely large.
- Claude Sonnet 5 is at introductory pricing through **2026-08-31**. Log `cost_paise` from
  a `const` price map so the change is one line, not an archaeology exercise.

## What never gets built

Not "later" — **not**:

- **AI in the write path.** No model creates, edits, or commits a transaction. Writes go
  through `createServerFn` → Postgres RPCs for ledger correctness, and that is the whole
  reason the ledger is trustworthy.
- **LLM-generated SQL.** Already ruled out by the PRD. It survives contact with every
  version of "but with good prompting".
- **Raw transaction rows in a prompt.** The digest exists precisely so this never happens.
  Stage 3 sends merchant strings — the single deliberate exception, opt-in and recorded.
- **A model deciding what is anomalous, forecast, or overdue.** Stage 2 is arithmetic. If a
  future idea needs a model to decide a number, it belongs in Stage 2 as maths or nowhere.
- **Investment or tax advice.** The system prompt already refuses. Keep it refusing.
- **Auto-commit of anything AI-suggested.** Every suggestion goes through review.
- **In-browser LLM.** Argued in the [README](README.md#two-things-deliberately-not-being-built).
  Ollama is the local-model answer instead: same privacy story, none of the 500MB download.

## Done when

Each stage ships behind its gate, and no stage ships early because the previous one was
"basically fine".

Two additional checks, because Stage 1 makes them possible:

- Every AI call in the app is visible in `ai_calls` with a cost, and the 25-call ceiling is
  enforced in `ask()` rather than in each caller.
- A self-hoster with no keys at all sees a fully working app with the AI surfaces quietly
  absent — and a self-hoster with only Ollama running gets Stages 3 and 4 with nothing
  leaving their machine.
