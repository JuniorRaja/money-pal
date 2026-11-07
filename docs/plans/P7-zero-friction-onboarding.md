# P7: Zero-Friction Onboarding & AI-Assisted Categorization

First import goes from ~100 manual decisions to ~6 taps.
Finishes P6 D3. Adds grouping, an AI pass, and a mandatory onboarding flow.

## Baseline — measured on `origin/main` @ e59e3f0

| Fact | Value | Source |
|---|---|---|
| Keyword rules | 59 keywords / 12 categories | `heuristics.ts` |
| Seeded global categories | 15 | `20260811150500_seed_categories_and_profile_trigger.sql` |
| Seeded categories with no keyword rule | Rent, Freelance, Transfer | cross-check |
| Note used for keyword matching | No | `heuristics.ts:272-275` |
| Grouping in review UI | None | `review-deck.tsx`, `review-table.tsx` |
| Rule applied to sibling rows in same import | No | `review-deck.tsx:217` |
| Onboarding route | Does not exist | `src/routes/` |
| Wizard steps | `file → map → account` | `import-wizard.tsx:31` |
| Commit path | One RPC per row | `commitImportRowFn` |
| LLM wiring | Exists, Anthropic → OpenRouter | `assistant.functions.ts` |

## Decisions

| # | Decision |
|---|---|
| D1 | Note is a matching signal, not just display. Match note before narration; note hit scores `+0.06`. |
| D2 | Group key priority: normalized note → keyword category → normalized payee. |
| D3 | Review shows groups, not rows. One pick applies to every row in the group. |
| D4 | Rules written silently. No "remember this?" checkbox. Stated once at the end. |
| D5 | Progress measured in rupees, not row count. `needs_input` sorted by total value. |
| D6 | No step inside the flow can trap the user. "Import anyway" always live. |
| D7 | `KEYWORD_RULES` moves to `keywords.ts` as data. ~59 → ~400 entries. |
| D8 | Recurrence is a signal: monthly + near-identical amount → Rent / EMI / Salary. |
| D9 | AI categorization is a layer on top of rule → keyword → recurrence, never the foundation. |
| D10 | AI is progressive enhancement. Screen renders before the call returns; failure is invisible. |
| D11 | Only derived labels leave the browser. No file, amounts, dates, balances, narration. Size is a coarse bucket. |
| D12 | Model proposes categories; user approves by tapping. Max 5 per import. Nothing written otherwise. |
| D13 | AI output validated before use. Unknown ids dropped, unlisted categories rejected, confidence clamped. Malformed = no response. |
| D14 | AI confidence capped at 0.75, under `IMPORT_LOW_CONFIDENCE_MAX`. Pre-fills a chip, never self-commits. |

Resolution order per group:

```
user rule → keyword → recurrence → AI → user taps
 (exact)    (instant)  (instant)   (~2s)  (last resort)
```

AI payload per group (D11):

```jsonc
{ "id": "g2", "label": "FAGS", "kind": "note",
  "count": 18, "direction": "expense",
  "recurring": false, "size": "small" }   // small | medium | large
```

## Settled questions

| Q | Answer |
|---|---|
| Teach screen location | Separate component, onboarding-owned. Not an import wizard mode. |
| Category creation in-flow | Yes, AI-proposed, user-approved. |
| Onboarding skippable | No. Mandatory for a user with zero accounts. |

---

# Part 1 — Note-first categorization

Pure functions. Completes P6 D3.

### Action items

- [ ] 1.1 `normalizeNoteKey(note): string` in `heuristics.ts` — uppercase, collapse whitespace, strip month names (full + 3-letter), strip standalone digit runs and ordinals, strip trailing punctuation, `""` when nothing remains
- [ ] 1.2 Match keywords against normalized note before narration
- [ ] 1.3 Note hit returns `min(rule.confidence + 0.06, 0.95)`
- [ ] 1.4 Keyword rules for the three orphaned categories
  - `Rent` — RENT, HOUSE RENT, ROOM RENT, LANDLORD, MAINTENANCE, SOCIETY
  - `Transfer` — SELF, OWN ACCOUNT, TRANSFER TO, SWEEP, CREDIT CARD PAYMENT
  - `Freelance` — FREELANCE, CONSULTING, INVOICE, RETAINER, CONTRACT (income only)
- [ ] 1.5 `HeuristicSuggestion` gains `note_key: string | null`, `matched_on: "note" | "narration" | null`
- [ ] 1.6 Thread `note_key` through `MappedImportRow` and `buildMappedRows`

### Tests

| # | Asserts |
|---|---|
| T1.1 | `RENT MAY`, `RENT JUN`, `Rent July` → `RENT` |
| T1.2 | `RENT 2`, `RENT MAY 25` → `RENT` |
| T1.3 | `123`, `--`, `` → `""` |
| T1.4 | `...-SWIGGY-...-GROCERIES` → Groceries, not Dining |
| T1.5 | note match confidence > same rule via narration |
| T1.6 | `...-KRISHNA KUMAR-SBIN-XXXXXXX1893-RENT MAY` → `Rent` |
| T1.7 | self-transfer narration → `Transfer` |
| T1.8 | `INVOICE` as expense → not Freelance |
| T1.9 | every `KEYWORD_RULES[].category` exists in seed SQL |
| T1.10 | existing suite green |

**Done:** `test:unit` + `lint` green. Before/after categorized count on a real fixture in the PR.

---

# Part 2 — Wider auto-categorization

Pure functions. Keyword table + recurrence.

### Action items

- [ ] 2.1 Extract `KEYWORD_RULES` to `src/lib/import/keywords.ts`
- [ ] 2.2 Grow to ~400 keywords, India-weighted
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
- [ ] 2.3 `src/lib/import/recurrence.ts` — `detectRecurring(rows): RecurrenceHint[]`; group by `note_key` else payee; recurs at >= 2 occurrences, 25-35 days apart, amounts within 5%
  - `Rent` — expense, recurring, largest recurring expense, round thousand
  - `EMI` — expense, recurring, exact to the rupee across occurrences
  - `Salary` — income, recurring, largest recurring credit
- [ ] 2.4 Apply in `parse.ts` after `buildMappedRows`, only where `suggested_category_name` is null
- [ ] 2.5 Cap recurrence confidence at 0.75

### Tests

| # | Asserts |
|---|---|
| T2.1 | no cross-category duplicate keywords, all uppercase, no empties |
| T2.2 | every keyword category exists in seed |
| T2.3 | >= 350 keywords (guards truncation) |
| T2.4 | 3 rows ₹22,000 / 30 days apart → Rent |
| T2.5 | 3 rows ₹4,317 / 30 days apart → EMI |
| T2.6 | monthly credit, largest → Salary |
| T2.7 | single occurrence → no hint |
| T2.8 | 5 and 50 days apart → no hint |
| T2.9 | already-categorized row unchanged |
| T2.10 | confidence <= 0.75 |

**Done:** `test:unit` green. Auto-categorized share recorded against Part 1.

---

# Part 3 — Grouping engine and bulk commit

Pure module + commit path. No UI.

Grouping fixtures already in `heuristics.test.ts`:
```
UPI-APURVASIGAMANI-...-FAGS          ┐ different payees,
UPI-J AMALIYA COOL BAR-...-FAGS      ┘ one group
IMPS-...-KRISHNA KUMAR-...-RENT MAY    payee says nothing, note says everything
```

### Action items

- [ ] 3.1 `src/lib/import/group.ts` — `ReviewGroup = { id, key, keyKind: "note"|"keyword"|"payee", label, rowIds, rowCount, totalPaise, firstDate, lastDate, payees, suggestedCategoryName, confidence, source: "rule"|"keyword"|"recurrence"|"ai"|null, band }`
- [ ] 3.2 `groupRowsForReview(rows, options): ReviewGroup[]` — key priority per D2
- [ ] 3.3 Bands — `settled` (confidence >= 0.8 and category resolved), `trivial` (single occurrence, under ₹200), `needs_input` (rest)
- [ ] 3.4 Sort `needs_input` by `totalPaise` descending
- [ ] 3.5 `rankCategoriesForGroup(group, categories)` — 4 chips, ranked by kind match, amount shape, direction
- [ ] 3.6 `summariseProgress(groups): { settledPaise, totalPaise, pct }`
- [ ] 3.7 `sizeBucket(totalPaise, allGroups): "small"|"medium"|"large"` — feeds Part 4 payload
- [ ] 3.8 `bulkCommitImportRowsFn` in `mutations.functions.ts` — `{ rows: Array<{row_id, suggested_category_id}>, rules: UpsertImportRuleInput[] }`; one update per category, commit via RPC, rules written once
- [ ] 3.9 `match_field` derived from `keyKind` — note→`note`, payee→`payee`, keyword→`narration`

### Tests

| # | Asserts |
|---|---|
| T3.1 | two `FAGS` fixtures → one group |
| T3.2 | `RENT MAY/JUN/JUL` → one group of 3 |
| T3.3 | Swiggy + Zomato + EatSure → one `Dining` group |
| T3.4 | repeated `Apurvasigamani`, no note → one group |
| T3.5 | Swiggy row with note `LUNCH` groups under `LUNCH` |
| T3.6 | 0.86 → settled; 0.4 → needs_input; single ₹120 → trivial |
| T3.7 | ₹66,000 group precedes ₹4,320 group with more rows |
| T3.8 | 100-row fixture → <= 35 groups |
| T3.9 | income group offers no expense category |
| T3.10 | ₹22,000 round monthly expense offers Rent first |
| T3.11 | clearing top group moves pct more than five small ones |
| T3.12 | note group → `match_field: note`; payee group → `payee` |
| T3.13 | bulk commit categorizes every row in a group |
| T3.14 | rule count equals groups categorized |
| T3.15 | failing row does not half-commit the group |

**Done:** 100-row fixture → <= 35 groups, top 6 groups >= 70% of value, `test:unit` green.

---

# Part 4 — AI categorization pass

Server function + validation. No new UI; improves `suggested_category_id` on staged rows.

### Action items

- [ ] 4.1 `src/lib/categorize.functions.ts` — `categorizeGroupsFn` (`createServerFn`, `requireSupabaseAuth`), model `claude-haiku-5-5`, Anthropic → OpenRouter fallback as in `assistant.functions.ts`
- [ ] 4.2 Payload per D11 — label, kind, count, direction, recurring, size. Nothing else.
- [ ] 4.3 System prompt — Indian personal finance; assign each group to a listed category; may propose <= 5 new ones flagged `isNew` with a `kind`; **must return `null` where it cannot know** (person-to-person especially); must return every id given; must not invent ids
- [ ] 4.4 Validation per D13 — drop unknown ids, reject categories neither listed nor `isNew`, clamp confidence, cap new at 5, malformed → no response
- [ ] 4.5 Cap AI confidence at 0.75 (D14)
- [ ] 4.6 Apply only to groups unresolved after rule/keyword/recurrence
- [ ] 4.7 8s timeout, one retry, then give up silently
- [ ] 4.8 `aiCategorization` user setting, default on, one line on what leaves the device
- [ ] 4.9 Record D9-D14 in `docs/DECISIONS.md`

### Tests

| # | Asserts |
|---|---|
| T4.1 | serialized request contains no paise, date or balance field |
| T4.2 | request contains labels only, no narration |
| T4.3 | fabricated id in response is ignored |
| T4.4 | category neither seeded nor `isNew` is dropped |
| T4.5 | 9 proposals → 5 kept |
| T4.6 | returned 0.99 → stored 0.75 |
| T4.7 | `Apurvasigamani` → null stays null, no guess |
| T4.8 | keyword-hit group unchanged by AI response |
| T4.9 | API 500 → groups unchanged, no thrown error |
| T4.10 | 8s timeout → flow continues |
| T4.11 | missing env key → pass skipped, no error |
| T4.12 | `aiCategorization` false → no network call |
| T4.13 | unauthenticated call rejected |

**Done:** AI resolves a measurable share of groups keywords missed, returns null for person-to-person, every failure mode leaves the import working.

---

# Part 5 — Teach screen and mandatory onboarding

### Action items — teach screen (`src/components/onboarding/teach-screen.tsx`)

- [ ] 5.1 Band `settled` — collapsed strip, category totals, expandable
- [ ] 5.2 Band `needs_input` — card per group: label, `{n} payments · ₹{total} · {range}`, payee list, 4 chips + "Other"
- [ ] 5.3 AI-proposed categories render as marked chips (`+ Fitness`), created on tap only (D12)
- [ ] 5.4 AI suggestions stream in and upgrade blank cards without re-ordering on-screen cards (D10)
- [ ] 5.5 Band `trivial` — one strip, single "Skip these {n}"
- [ ] 5.6 Money-denominated progress bar, pinned (D5)
- [ ] 5.7 "Import anyway" always enabled (D6)
- [ ] 5.8 Undo toast per pick, 5s
- [ ] 5.9 Keyboard — number keys pick chips, `Enter` accepts, `Esc` skips
- [ ] 5.10 Card transition out, focus moves to next card

### Action items — route (`src/routes/onboarding.tsx`)

- [ ] 5.11 Steps `account → upload → teach → done`
- [ ] 5.12 Mandatory — zero-account user redirected here from every route, cannot navigate away
- [ ] 5.13 Account step — name and type only, no opening balance field
- [ ] 5.14 Upload step — reuse existing parse path incl. password handling; show date range and row count as confirmation
- [ ] 5.15 Infer, don't ask — opening balance from statement balance column, account type from detected preset, date range from parsed rows
- [ ] 5.16 Done step — commit via `bulkCommitImportRowsFn`, one line: "Next month's statement will mostly sort itself."
- [ ] 5.17 Resume returns to furthest step reached
- [ ] 5.18 Mobile first — 390px, one-handed reach, 44px targets
- [ ] 5.19 A11y — chips are buttons, progress has `aria-valuenow`, bands are landmarks
- [ ] 5.20 Update `CLAUDE.md` import pipeline line with `keywords.ts`, `recurrence.ts`, `group.ts`, `categorize.functions.ts`

### Tests

| # | Asserts |
|---|---|
| T5.1 | zero accounts → `/onboarding` from any route |
| T5.2 | direct nav to `/transactions` bounces back |
| T5.3 | user with accounts never sees it |
| T5.4 | account → upload → ~6 taps → dashboard with real charts |
| T5.5 | screen interactive before AI response lands |
| T5.6 | API down → flow completes, more cards in `needs_input` |
| T5.7 | AI-proposed chip creates the category and assigns the group |
| T5.8 | proposals alone write nothing to `categories` |
| T5.9 | undo reverts category, rule not written |
| T5.10 | keyboard completes the teach step, no mouse |
| T5.11 | password-protected PDF prompts in-flow, file never uploaded |
| T5.12 | opening balance matches statement, no field shown |
| T5.13 | reload during teach returns to teach |
| T5.14 | "Import anyway" commits everything |
| T5.15 | Settings lists one rule per group, correct `match_field` |
| T5.16 | later month leaves few groups in `needs_input` |
| T5.17 | no-notes statement groups by keyword and payee, no crash |
| T5.18 | single-transaction statement — one card, no divide-by-zero in progress |
| T5.19 | fully-categorized statement auto-skips to done |
| T5.20 | 390×844 — no horizontal scroll, targets >= 44px |
| T5.21 | axe — no serious or critical violations |
| T5.22 | `test:unit`, `test:e2e`, `lint`, `build` green |

**Done:**

| Metric | Before (e59e3f0) | After |
|---|---|---|
| Auto-categorized share of rows | | |
| Auto-categorized share of value | | |
| Groups needing input | | |
| Taps to finish | | |
| Taps to cover 80% of value | | |
| Time to populated dashboard | | |

Target: populated dashboard under 60s, under 10 taps.

---

## Order

```
Part 1 ──► Part 2 ──► Part 3 ──┬──► Part 4 ──┐
 (pure)    (pure)    (engine)  │    (AI)     ├──► Part 5
                               └─────────────┘   (UI + route)
```

Parts 1-3 pure, no UI or network risk. Part 4 needs Part 3's group shape. Part 5 needs both, degrades cleanly without Part 4 (D10).

## Out of scope

- Browser-resident models (ONNX, transformers.js, WebLLM) — server call is cheaper, better, already wired
- OCR for scanned PDFs — existing "no OCR" decision stands
- PDF layout generalization beyond HDFC savings — separate track
- Hash formula and near-duplicate rule — unchanged
