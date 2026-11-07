# P7: Zero-Friction Onboarding & AI-Assisted Categorization

> Turn the first import from 100 manual decisions into roughly 6 taps, finish what P6
> decided but did not build, and let a model do the part only a model can do.

## Summary

A new user signs up, adds an account, uploads three months of statement, and lands on a
review deck that asks them to categorize 100 transactions one at a time. Most arrive as
`Uncategorized`. They came to track money, not to teach the app that Swiggy is food.

Three causes:

1. **P6 decided note-first categorization but only half-built it.** `findImportRule` honours
   `match_field`, but `applyHeuristics` still matches keywords against narration only. The
   note is extracted, returned, and never used as a matching signal.
2. **Review is row-by-row.** 100 rows over three months are roughly 30 distinct things. There
   is no grouping anywhere in `review-deck.tsx` or `review-table.tsx`, and "Also remember this"
   writes a rule for *future* imports without applying it to the other rows in the *current* one.
3. **Keywords cannot know what they have not been told.** A 400-entry table covers the big
   brands. It will never know that `Cult.fit` is fitness or that `Zepto Marketplace` is
   groceries, and it cannot invent a category that fits a user's actual life.

P7 fixes the engine, groups the review, adds a model for the long tail, and wraps it all in
a mandatory onboarding flow.

## Baseline (measured on `origin/main`, commit e59e3f0)

| Fact | Value | Source |
|---|---|---|
| Keyword rules | 59 keywords across 12 categories | `heuristics.ts` |
| Seeded global categories | 15 | `20260811150500_seed_categories_and_profile_trigger.sql` |
| Seeded categories with **no** keyword rule | 3 — Rent, Freelance, Transfer | cross-check of the two above |
| Note used for keyword matching | **No** | `heuristics.ts:272-275` |
| Grouping in review UI | **None** | `review-deck.tsx`, `review-table.tsx` |
| Rule applied to sibling rows in same import | **No** | `review-deck.tsx:217` |
| Onboarding route | **Does not exist** | `src/routes/` |
| Import wizard steps | `file → map → account` | `import-wizard.tsx:31` |
| Commit path | One RPC per row | `commitImportRowFn` |
| LLM wiring | Exists, Anthropic → OpenRouter fallback | `assistant.functions.ts` |

## Evidence for note-first

Fixtures already in `heuristics.test.ts`:

```
UPI-APURVASIGAMANI-Q441555410@YBL-YESB0YBLUPI-861873771914-FAGS
UPI-J AMALIYA COOL BAR-Q356602405@YBL-YESB0YBLUPI-551426053310-FAGS
IMPS-616232121393-KRISHNA KUMAR-SBIN-XXXXXXX1893-RENT MAY
```

Two different payees, one note (`FAGS`) — grouping by payee yields two meaningless groups,
grouping by note yields one the user recognizes instantly. And `KRISHNA KUMAR` says nothing
while `RENT MAY` says everything.

`RENT MAY` / `RENT JUN` / `RENT JUL` must collapse to one group, so note keys need
normalizing (case, month names, digits, reference tails) before they can be grouped.

---

## Resolved decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Where does the teach screen live? | **Separate component**, onboarding-owned. Not a mode of the import wizard. |
| Q2 | Can categories be created during the flow? | **Yes, with AI help.** The model proposes a coherent set from the whole statement, not 30 ad-hoc ones. |
| Q3 | Can onboarding be skipped? | **No.** Onboarding is mandatory for a new user. |

---

## Decisions

### D1: Note is a first-class matching signal, not just a display field
`applyHeuristics` matches keywords against the normalized note first, then the narration. A
note hit scores higher confidence than the same keyword found in narration, because the note
is what the user typed, not what the rail generated.

### D2: Group key priority is note → keyword → payee
Mirrors P6 D3. A normalized note wins. Absent a note, a keyword hit groups by category.
Absent both, the normalized payee groups.

### D3: Review groups, not rows
The review surface shows one card per group. A category pick applies to every row in the
group, in the current import, and writes an `import_rule` for future ones.

### D4: Rules are written silently
No "Also remember this?" checkbox on the group card. Choosing a category for a group is
itself the instruction to remember. The flow states this once, at the end.

### D5: Progress is measured in rupees, not row count
Sorting groups by total amount and showing a money-denominated progress bar means the first
few taps clear most of the statement. Count-based progress reads 13% after four taps and
feels endless; money-based reads 80% and feels nearly done.

### D6: Nothing blocks the import
"Import anyway" is available from the first render. `Uncategorized` is a valid end state,
not an error. Onboarding itself is mandatory (Q3), but no *step inside it* can trap the user.

### D7: Keyword rules move from code to data
`KEYWORD_RULES` grows from 59 keywords to roughly 400. It becomes a separate data module so
it can grow without touching matching logic.

### D8: Recurrence is a categorization signal
A near-identical amount recurring monthly is Rent or EMI. The largest recurring credit is
Salary. Computable from parsed rows with no extra data and no model.

### D9: AI categorization is in scope, as a layer on top — not as the foundation
*(This reverses the earlier draft, which excluded it.)*

A model is the only thing that can categorize `Cult.fit`, `Zepto Marketplace` or `Licious`
without being told, and the only thing that can propose a category set that fits the user's
actual spending. Keywords and recurrence stay underneath it because they are instant, free,
offline, deterministic and unit-testable. The model handles what they miss.

Order of resolution per group:

```
user rule  →  keyword hit  →  recurrence hint  →  AI pass  →  user taps
(exact)       (instant)       (instant)           (~2s)       (last resort)
```

### D10: AI is progressive enhancement, never a dependency
The teach screen renders immediately from keywords and recurrence. The AI result arrives
after and upgrades cards that are still blank. If the call fails, times out, or no API key
is configured, the flow is fully usable — it just has more cards in `needs_input`. No
spinner gates the UI.

### D11: Only derived labels leave the browser, never the statement
The AI pass sends group labels, a count, a direction and a coarse size bucket. It does not
send the file, exact amounts, dates, balances, account numbers or narration. A new
`DECISIONS.md` entry records this; the existing "file is never uploaded" rule is unchanged
and still true.

What is sent per group:

```jsonc
{ "id": "g2", "label": "FAGS", "kind": "note",
  "count": 18, "direction": "expense",
  "recurring": false, "size": "small" }   // size ∈ small | medium | large
```

### D12: The model proposes categories; the user approves them
AI-proposed new categories are shown as suggestions on the group card, visibly marked as
new. Nothing is written to `categories` until the user taps. Cap: 5 new proposals per
import, so the flow cannot explode the category list.

### D13: AI output is validated, never trusted
Every response is checked before use: every returned id must exist in the request, every
category must be either an existing name or flagged `isNew`, confidence must parse to
0–1. Unknown ids are dropped. A malformed response is treated as no response.

### D14: AI confidence is capped below the auto-accept threshold
AI-derived suggestions cap at 0.75, under `IMPORT_LOW_CONFIDENCE_MAX` (0.8). The model
pre-fills the chip; it never silently commits a category. One tap still confirms.

---

# Part 1 — Note-first categorization

Completes P6 D3. Pure functions only. No UI, no schema.

**Ships alone:** every existing user's next import categorizes better the moment this merges.

### Action items

- [ ] 1.1 Add `normalizeNoteKey(note: string): string` to `heuristics.ts`
  - uppercase, collapse whitespace
  - strip month names (full and 3-letter, English)
  - strip standalone digit runs and ordinals (`RENT 2`, `RENT MAY 25`)
  - strip trailing punctuation
  - return `""` when nothing meaningful remains
- [ ] 1.2 Match keywords against the normalized note before the narration
- [ ] 1.3 Note hit returns `min(rule.confidence + 0.06, 0.95)`
- [ ] 1.4 Keyword rules for the three orphaned seeded categories
  - `Rent` — RENT, HOUSE RENT, ROOM RENT, LANDLORD, MAINTENANCE, SOCIETY
  - `Transfer` — SELF, OWN ACCOUNT, TRANSFER TO, SWEEP, CREDIT CARD PAYMENT
  - `Freelance` — FREELANCE, CONSULTING, INVOICE, RETAINER, CONTRACT (income only)
- [ ] 1.5 Extend `HeuristicSuggestion` with `note_key: string | null` and `matched_on: "note" | "narration" | null`
- [ ] 1.6 Thread `note_key` through `MappedImportRow` and `buildMappedRows`

### Testing checklist

| # | Test | Asserts |
|---|---|---|
| T1.1 | `normalizeNoteKey` collapses months | `RENT MAY`, `RENT JUN`, `Rent July` → `RENT` |
| T1.2 | strips digits | `RENT 2`, `RENT MAY 25` → `RENT` |
| T1.3 | returns empty for noise | `123`, `--`, `` → `""` |
| T1.4 | note hit beats narration hit | `...-SWIGGY-...-GROCERIES` → Groceries, not Dining |
| T1.5 | note hit scores higher | note match confidence > same rule via narration |
| T1.6 | Rent now categorizes | `...-KRISHNA KUMAR-SBIN-XXXXXXX1893-RENT MAY` → `Rent` |
| T1.7 | Transfer now categorizes | self-transfer narration → `Transfer` |
| T1.8 | Freelance is income-gated | `INVOICE` as expense → not Freelance |
| T1.9 | every rule category exists in seed | each `KEYWORD_RULES[].category` appears in seed SQL |
| T1.10 | no regression | `npm run test:unit` green |

### Done when
`test:unit` and `lint` green; before/after categorized count on a real fixture recorded in the PR.

---

# Part 2 — Wider auto-categorization

Grows the keyword table and adds recurrence. Still pure functions.

**Ships alone:** raises the auto-categorized share again, independent of any UI or AI work.

### Action items

- [ ] 2.1 Extract `KEYWORD_RULES` into `src/lib/import/keywords.ts` as data
- [ ] 2.2 Grow to roughly 400 keywords, India-weighted
  - Dining — Box8, Faasos, Behrouz, Wow Momo, Chaayos, Third Wave, Blue Tokai, Haldiram, Bikanervala
  - Groceries — JioMart, Licious, Country Delight, Milkbasket, Reliance Fresh, More, Spencers, Star Bazaar
  - Transport — Namma Yatri, Blusmart, Quick Ride, Shell, Nayara, Jio-bp, Chalo, DMRC, BMRCL, CMRL
  - Shopping — Tata Cliq, Snapdeal, Lenskart, Decathlon, Reliance Digital, Vijay Sales, Pepperfry, IKEA
  - Entertainment — JioCinema, Zee5, Aha, Sun NXT, Audible, Kindle, Steam, PlayStation, Cinepolis
  - Utilities — Airtel, Jio, Vi, BSNL, ACT, Hathway, Tata Play, TNEB, BESCOM, MSEB, BSES, Indane, HP Gas
  - Healthcare — Apollo, PharmEasy, Netmeds, Tata 1mg, Practo, Cult.fit, Dr Lal PathLabs, Thyrocare, Medplus
  - Travel — MakeMyTrip, Goibibo, Cleartrip, EaseMyTrip, Yatra, Ixigo, RedBus, Oyo, Indigo, Vistara, Akasa
  - Investments — Zerodha, Groww, Upstox, Kuvera, Coin, INDmoney, Smallcase, NPS, PPF, ELSS, SIP
  - EMI — Bajaj Finserv, HDB, Slice, LazyPay, Simpl, KreditBee
  - Insurance — LIC, HDFC Life, ICICI Pru, Star Health, Niva Bupa, Acko, Digit
- [ ] 2.3 Add `src/lib/import/recurrence.ts` with `detectRecurring(rows): RecurrenceHint[]`
  - group by `note_key` else payee; recurs when >= 2 occurrences, 25–35 days apart, amounts within 5%
  - `Rent` — expense, recurring, largest recurring expense, round thousand
  - `EMI` — expense, recurring, exact to the rupee across occurrences
  - `Salary` — income, recurring, largest recurring credit
- [ ] 2.4 Apply hints in `parse.ts` after `buildMappedRows`, only where `suggested_category_name` is null
- [ ] 2.5 Cap recurrence confidence at 0.75

### Testing checklist

| # | Test | Asserts |
|---|---|---|
| T2.1 | keyword table well-formed | no cross-category duplicates, all uppercase, no empties |
| T2.2 | every keyword category exists in seed | cross-check against seeded names |
| T2.3 | keyword count floor | >= 350 (guards truncation) |
| T2.4 | monthly same-amount expense → Rent | 3 rows, ₹22,000, 30 days apart |
| T2.5 | exact-to-rupee recurring → EMI | 3 rows, ₹4,317, 30 days apart |
| T2.6 | largest recurring credit → Salary | monthly credit |
| T2.7 | two occurrences enough, one is not | single occurrence yields no hint |
| T2.8 | irregular spacing is not recurrence | 5 and 50 days apart → no hint |
| T2.9 | never overrides a keyword hit | already-categorized row unchanged |
| T2.10 | stays reviewable | confidence <= 0.75 |

### Done when
`test:unit` green; auto-categorized share recorded against the Part 1 number.

---

# Part 3 — Grouping engine and bulk commit

Pure module plus the commit path. No UI yet.

**Ships alone:** the grouping library is tested and the existing review UI gets a bulk
commit path that replaces 100 round trips with a handful.

### Action items

- [ ] 3.1 Add `src/lib/import/group.ts`
  - `type ReviewGroup = { id, key, keyKind: "note"|"keyword"|"payee", label, rowIds, rowCount, totalPaise, firstDate, lastDate, payees, suggestedCategoryName, confidence, source: "rule"|"keyword"|"recurrence"|"ai"|null, band }`
  - `groupRowsForReview(rows, options): ReviewGroup[]`, key priority per D2
- [ ] 3.2 Band assignment
  - `settled` — confidence >= 0.8 and a category resolved
  - `needs_input` — everything else above the trivial threshold
  - `trivial` — single occurrence, total under ₹200
- [ ] 3.3 Sort `needs_input` by `totalPaise` descending
- [ ] 3.4 `rankCategoriesForGroup(group, categories): Category[]` — 4 chips, ranked by kind match, amount shape, direction
- [ ] 3.5 `summariseProgress(groups): { settledPaise, totalPaise, pct }`
- [ ] 3.6 `sizeBucket(totalPaise, allGroups): "small"|"medium"|"large"` — used by Part 4's AI payload
- [ ] 3.7 Add `bulkCommitImportRowsFn` to `mutations.functions.ts` — `{ rows: Array<{row_id, suggested_category_id}>, rules: UpsertImportRuleInput[] }`; one update per category, commit via RPC, rules written once
- [ ] 3.8 Derive `match_field` from `keyKind` — `note` → `note`, `payee` → `payee`, `keyword` → `narration`

### Testing checklist

| # | Test | Asserts |
|---|---|---|
| T3.1 | note key groups across payees | the two `FAGS` fixtures land in one group |
| T3.2 | month variants collapse | `RENT MAY/JUN/JUL` → one group of 3 |
| T3.3 | keyword groups when no note | Swiggy + Zomato + EatSure → one `Dining` group |
| T3.4 | payee groups when neither | repeated `Apurvasigamani`, no note → one group |
| T3.5 | note beats keyword | Swiggy row with note `LUNCH` groups under `LUNCH` |
| T3.6 | band split correct | 0.86 → settled; 0.4 → needs_input; single ₹120 → trivial |
| T3.7 | needs_input sorted by money | ₹66,000 group precedes ₹4,320 group with more rows |
| T3.8 | realistic collapse ratio | 100-row fixture → <= 35 groups |
| T3.9 | chip ranking respects direction | income group offers no expense category |
| T3.10 | chip ranking favours shape | ₹22,000 round monthly expense offers Rent first |
| T3.11 | progress is money-weighted | clearing top group moves pct more than five small ones |
| T3.12 | match_field derived from keyKind | note group → `note`; payee group → `payee` |
| T3.13 | bulk commit writes all rows | one call categorizes every row in a group |
| T3.14 | bulk commit writes one rule per group | rule count equals groups categorized |
| T3.15 | bulk commit is atomic per group | a failing row does not half-commit the group |

### Done when
100-row fixture → <= 35 groups, top 6 groups >= 70% of value, `test:unit` green.

---

# Part 4 — AI categorization pass

The model layer. Server function plus validation. Still no new UI — it improves
`suggested_category_id` on staged rows, visible in the existing review surface.

**Ships alone:** every import gets better suggestions, with or without the teach screen.

### Action items

- [ ] 4.1 Add `src/lib/categorize.functions.ts` — `categorizeGroupsFn` (`createServerFn`, `requireSupabaseAuth`)
  - model `claude-haiku-5-5` (latency matters here, unlike the assistant's Opus)
  - reuse the Anthropic → OpenRouter fallback shape from `assistant.functions.ts`
- [ ] 4.2 Request payload per D11 — label, kind, count, direction, recurring, size bucket. Nothing else.
- [ ] 4.3 System prompt
  - Indian personal finance context
  - given the user's category list, assign each group to one
  - may propose at most 5 new categories, each flagged `isNew` with a `kind`
  - **must return `null` for groups it cannot know** — person-to-person names especially
  - must return every id it was given; must not invent ids
- [ ] 4.4 Response validation per D13 — drop unknown ids, reject categories that are neither existing nor `isNew`, clamp confidence, cap new categories at 5. Malformed → treat as no response.
- [ ] 4.5 Cap AI confidence at 0.75 per D14
- [ ] 4.6 Apply only to groups still unresolved after rule/keyword/recurrence — never overwrite a deterministic hit
- [ ] 4.7 Timeout at 8s, one retry, then give up silently
- [ ] 4.8 Add `aiCategorization` user setting, default on, with a one-line explanation of what leaves the device
- [ ] 4.9 Record D9–D14 in `docs/DECISIONS.md`

### Testing checklist

| # | Test | Asserts |
|---|---|---|
| T4.1 | payload carries no amounts | serialized request contains no paise, date or balance field |
| T4.2 | payload carries no narration | request contains labels only |
| T4.3 | unknown id dropped | fabricated id in response is ignored |
| T4.4 | unlisted category rejected | category neither seeded nor `isNew` is dropped |
| T4.5 | new categories capped | 9 proposals → 5 kept |
| T4.6 | confidence clamped | returned 0.99 → stored 0.75 |
| T4.7 | null is honoured | `Apurvasigamani` → null stays null, no guess |
| T4.8 | never overrides deterministic | keyword-hit group unchanged by AI response |
| T4.9 | failure is silent | API 500 → groups unchanged, no thrown error |
| T4.10 | timeout is silent | 8s timeout → flow continues |
| T4.11 | no key configured | missing env → pass skipped, no error |
| T4.12 | setting off | `aiCategorization` false → no network call made |
| T4.13 | auth required | unauthenticated call rejected |

### Done when
On a real fixture, AI resolves a measurable share of groups that keywords missed, returns
null for person-to-person, and every failure mode leaves the import working.

---

# Part 5 — Teach screen and mandatory onboarding

The user-facing deliverable. Separate component per Q1, mandatory flow per Q3.

### Action items

**Teach screen** — `src/components/onboarding/teach-screen.tsx`, standalone (Q1)

- [ ] 5.1 Band 1 `settled` — one collapsed strip with category totals, expandable
- [ ] 5.2 Band 2 `needs_input` — one card per group: label, `{n} payments · ₹{total} · {range}`, payee list, 4 chips + "Other"
- [ ] 5.3 AI-proposed new categories render as marked chips (`+ Fitness`), created on tap only (D12)
- [ ] 5.4 AI suggestions stream in and upgrade blank cards without re-ordering what is on screen (D10)
- [ ] 5.5 Band 3 `trivial` — one strip, single "Skip these {n}" button
- [ ] 5.6 Money-denominated progress bar, pinned (D5)
- [ ] 5.7 "Import anyway" always enabled (D6)
- [ ] 5.8 Undo toast per pick, 5s, reversible
- [ ] 5.9 Keyboard path — number keys pick chips, `Enter` accepts, `Esc` skips
- [ ] 5.10 Card transitions, focus moves to the next card after a pick

**Onboarding route** — `src/routes/onboarding.tsx`

- [ ] 5.11 Steps: `account → upload → teach → done`
- [ ] 5.12 Mandatory (Q3) — a user with zero accounts is redirected here from every route, and cannot navigate away until the flow completes
- [ ] 5.13 Account step — name and type only. No opening balance field.
- [ ] 5.14 Upload step — reuse the existing parse path including password handling; show detected date range and row count as confirmation, not as a question
- [ ] 5.15 Infer rather than ask — opening balance from the statement's balance column, account type from the detected preset, date range from parsed rows
- [ ] 5.16 Done step — commit via `bulkCommitImportRowsFn`, then one line: "Next month's statement will mostly sort itself."
- [ ] 5.17 Resume — re-entry returns to the furthest step reached
- [ ] 5.18 Mobile first — 390px, one-handed reach, 44px targets
- [ ] 5.19 Accessibility — chips are buttons, progress has `aria-valuenow`, bands are landmarks
- [ ] 5.20 Update `CLAUDE.md` import pipeline line to name `keywords.ts`, `recurrence.ts`, `group.ts`, `categorize.functions.ts`

### Testing checklist

| # | Test | Asserts |
|---|---|---|
| T5.1 | fresh user is redirected | zero accounts → `/onboarding` from any route |
| T5.2 | cannot escape onboarding | direct nav to `/transactions` bounces back |
| T5.3 | existing user unaffected | user with accounts never sees it |
| T5.4 | full happy path | account → upload → ~6 taps → dashboard with real charts |
| T5.5 | AI chips appear after render | screen is interactive before the AI response lands |
| T5.6 | AI failure invisible | API down → flow completes, more cards in band 2 |
| T5.7 | new category created on tap | AI-proposed chip creates the category and assigns the group |
| T5.8 | new category not created without tap | proposals alone write nothing to `categories` |
| T5.9 | undo restores a group | category reverts, rule not written |
| T5.10 | keyboard completes the flow | no mouse, teach step finished |
| T5.11 | password-protected PDF | prompts in-flow, file never uploaded |
| T5.12 | opening balance inferred | balance matches statement, no field shown |
| T5.13 | resume mid-flow | reload during teach returns to teach |
| T5.14 | zero-tap finish | "Import anyway" commits everything |
| T5.15 | rules persisted | Settings lists one rule per group, correct `match_field` |
| T5.16 | second import is quiet | later month leaves few groups in `needs_input` |
| T5.17 | no-notes statement | groups by keyword and payee, no crash |
| T5.18 | single-transaction statement | one card, no division by zero in progress |
| T5.19 | fully-categorized statement | teach step auto-skips to done |
| T5.20 | mobile viewport | 390×844, no horizontal scroll, targets >= 44px |
| T5.21 | axe clean | no serious or critical violations on the teach screen |
| T5.22 | full regression | `test:unit`, `test:e2e`, `lint`, `build` green |

### Done when

| Metric | Before (e59e3f0) | After P7 |
|---|---|---|
| Auto-categorized share of rows | | |
| Auto-categorized share of value | | |
| Groups needing input | | |
| Taps to finish | | |
| Taps to cover 80% of value | | |
| Time to populated dashboard | | |

Target: populated dashboard in under 60 seconds, under 10 taps.

---

## Dependency order

```
Part 1 ──► Part 2 ──► Part 3 ──┬──► Part 4 ──┐
 (pure)    (pure)    (engine)  │   (AI)      ├──► Part 5
                                └─────────────┘    (UI + route)
```

Parts 1–3 are pure and carry no UI or network risk. Part 4 needs Part 3's group shape.
Part 5 needs both, but degrades cleanly without Part 4 (D10).

## Out of scope

- Browser-resident models — ONNX, transformers.js, WebLLM. The server call is cheaper,
  better and already wired. Revisit only if the privacy stance in D11 tightens.
- OCR for scanned PDFs. Still governed by the existing "no OCR" decision.
- PDF layout generalization beyond HDFC savings. Separate track.
- Changing the hash formula or the near-duplicate rule.
