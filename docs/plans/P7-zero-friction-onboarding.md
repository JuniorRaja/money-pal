# P7: Zero-Friction Onboarding & Note-First Categorization

> Turn the first import from 100 manual decisions into roughly 6 taps, and finish
> what P6 decided but did not build.

## Summary

A new user signs up, adds an account, uploads three months of statement, and lands on a
review deck that asks them to categorize 100 transactions one at a time. Most arrive as
`Uncategorized`. They came to track money, not to teach the app that Swiggy is food.

Two things cause this, and neither is a missing AI model.

1. **P6 decided note-first categorization but only half-built it.** `findImportRule` honours
   `match_field`, but `applyHeuristics` still matches keywords against narration only. The
   note is extracted, returned, and never used as a matching signal.
2. **Review is row-by-row.** 100 rows over three months are roughly 30 distinct things. There
   is no grouping anywhere in `review-deck.tsx` or `review-table.tsx`, and "Also remember this"
   writes a rule for *future* imports without applying it to the other rows in the *current* one.

P7 fixes the engine, groups the review, and wraps it in a real onboarding flow.

## Baseline (measured on `origin/main`, commit e59e3f0)

| Fact | Value | Source |
|---|---|---|
| Keyword rules | 59 keywords across 12 categories | `heuristics.ts` |
| Seeded global categories | 15 | `20260811150500_seed_categories_and_profile_trigger.sql` |
| Seeded categories with **no** keyword rule | 3 — Rent, Freelance, Transfer | cross-check of the two above |
| Note used for keyword matching | **No** | `applyHeuristics` calls `matchRule(normalizeNarration(narration))` |
| Grouping in review UI | **None** | `review-deck.tsx`, `review-table.tsx` |
| Rule applied to sibling rows in same import | **No** | `review-deck.tsx:217` |
| Onboarding route | **Does not exist** | `src/routes/` |
| Import wizard steps | `file → map → account` | `import-wizard.tsx:31` |
| Commit path | One RPC per row | `commitImportRowFn` |

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

## Decisions

### D1: Note is a first-class matching signal, not just a display field
`applyHeuristics` matches keywords against the normalized note first, then the narration.
A note hit scores higher confidence than the same keyword found in narration, because the
note is what the user typed, not what the rail generated.

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
not an error. Onboarding can be exited at any point with data committed.

### D7: Keyword rules move from code to data
`KEYWORD_RULES` grows from 59 keywords to roughly 400. It becomes a separate data module so
it can grow without touching matching logic, and so one test can assert the whole table is
well-formed.

### D8: Recurrence is a categorization signal
A near-identical amount recurring monthly is Rent or EMI. The largest recurring credit is
Salary. These are computable from parsed rows with no extra data and no model.

### D9: No ML model in P7
Everything here is deterministic and unit-testable. Embedding and LLM categorization stay
out of scope; P7 deliberately builds the grouping and verification layer those would plug
into later, so adding one becomes an experiment rather than a dependency.

---

## Open decisions — need a call before Part 3 and Part 4 start

| # | Question | Options | Blocks |
|---|---|---|---|
| Q1 | Where does the teach screen live? | (a) new view mode inside the existing import wizard, reused by onboarding; (b) separate onboarding-only component | Part 3 |
| Q2 | Can a group card create a brand-new category inline? | (a) pick from the 15 seeded only, create later in Settings; (b) allow inline create | Part 3 |
| Q3 | Does onboarding force an import? | (a) "Skip, I'll add later" exits to an empty dashboard; (b) import is required to finish | Part 4 |

Recommended: Q1(a), Q2(b), Q3(a). Q2(b) matters because a user whose biggest group is
"FAGS" may want a category the seed list does not have, and sending them to Settings
mid-flow breaks the whole premise.

---

# Part 1 — Note-first categorization

Completes P6 D3. Pure functions only. No UI, no schema, no new files beyond tests.

**Ships alone:** every existing user's next import categorizes better the moment this merges.

### Action items

- [ ] 1.1 Add `normalizeNoteKey(note: string): string` to `heuristics.ts`
  - uppercase, collapse whitespace
  - strip month names (full and 3-letter, English)
  - strip standalone digit runs and ordinals (`RENT 2`, `RENT MAY 25`)
  - strip trailing punctuation
  - return `""` when nothing meaningful remains
- [ ] 1.2 Add `matchRule` call against the normalized note, before the narration call
- [ ] 1.3 Add `noteConfidenceBonus` — a note hit returns `min(rule.confidence + 0.06, 0.95)`
- [ ] 1.4 Add keyword rules for the three orphaned seeded categories
  - `Rent` — RENT, HOUSE RENT, ROOM RENT, LANDLORD, MAINTENANCE, SOCIETY
  - `Transfer` — SELF, OWN ACCOUNT, TRANSFER TO, SWEEP, CREDIT CARD PAYMENT
  - `Freelance` — FREELANCE, CONSULTING, INVOICE, RETAINER, CONTRACT (income only)
- [ ] 1.5 Extend `HeuristicSuggestion` with `note_key: string | null` and `matched_on: "note" | "narration" | null`
- [ ] 1.6 Thread `note_key` through `MappedImportRow` in `types.ts` and `buildMappedRows` in `parse.ts`

### Testing checklist

| # | Test | File | Asserts |
|---|---|---|---|
| T1.1 | `normalizeNoteKey` collapses months | `heuristics.test.ts` | `RENT MAY`, `RENT JUN`, `Rent July` → `RENT` |
| T1.2 | `normalizeNoteKey` strips digits | `heuristics.test.ts` | `RENT 2`, `RENT MAY 25` → `RENT` |
| T1.3 | `normalizeNoteKey` returns empty for noise | `heuristics.test.ts` | `123`, `--`, `` → `""` |
| T1.4 | Note hit beats narration hit | `heuristics.test.ts` | `...-SWIGGY-...-GROCERIES` → Groceries, not Dining |
| T1.5 | Note hit scores higher confidence | `heuristics.test.ts` | note match confidence > same rule via narration |
| T1.6 | Rent now categorizes | `heuristics.test.ts` | `IMPS-616232121393-KRISHNA KUMAR-SBIN-XXXXXXX1893-RENT MAY` → `Rent` |
| T1.7 | Transfer now categorizes | `heuristics.test.ts` | a self-transfer narration → `Transfer` |
| T1.8 | Freelance is income-gated | `heuristics.test.ts` | `INVOICE` as expense → not Freelance |
| T1.9 | Every rule category exists in seed | new `heuristics.test.ts` case | each `KEYWORD_RULES[].category` appears in the seed SQL list |
| T1.10 | No regression | existing suite | `npm run test:unit` green |

### Done when

`npm run test:unit` green, `npm run lint` clean, and a fixture statement that previously
produced N categorized rows now produces measurably more. Record before/after in the PR.

---

# Part 2 — Wider auto-categorization

Grows the keyword table and adds recurrence signals. Still pure functions.

**Ships alone:** raises the auto-categorized share again, independent of any UI work.

### Action items

- [ ] 2.1 Extract `KEYWORD_RULES` into `src/lib/import/keywords.ts` as data
- [ ] 2.2 Grow to roughly 400 keywords, India-weighted
  - Dining — add Box8, Faasos, Behrouz, Wow Momo, Chaayos, Third Wave, Blue Tokai, Haldiram, Bikanervala, local chains
  - Groceries — add JioMart, Licious, Country Delight, Milkbasket, Reliance Fresh, More, Spencers, Nature's Basket, Star Bazaar
  - Transport — add Namma Yatri, Blusmart, Quick Ride, Shell, Nayara, Jio-bp, Chalo, metro operators (DMRC, BMRCL, CMRL)
  - Shopping — add Tata Cliq, Snapdeal, Lenskart, Decathlon, Reliance Digital, Vijay Sales, Pepperfry, Urban Ladder, IKEA
  - Entertainment — add JioCinema, Zee5, Aha, Sun NXT, Audible, Kindle, Steam, PlayStation, Cinepolis, Carnival
  - Utilities — add Airtel, Jio, Vi, BSNL, ACT, Hathway, Tata Play, electricity boards (TNEB, BESCOM, MSEB, BSES, Adani Electricity), gas (Indane, HP Gas, Bharat Gas)
  - Healthcare — add Apollo, PharmEasy, Netmeds, Tata 1mg, Practo, Cult.fit, Dr Lal PathLabs, Thyrocare, Medplus
  - Travel — add MakeMyTrip, Goibibo, Cleartrip, EaseMyTrip, Yatra, Ixigo, RedBus, Oyo, Airbnb, Indigo, Vistara, Air India, Akasa
  - Investments — add Zerodha, Groww, Upstox, Kuvera, Coin, INDmoney, Smallcase, NPS, PPF, ELSS, SIP
  - EMI — add Bajaj Finserv, HDB, Slice, LazyPay, Simpl, KreditBee, loan EMI patterns
  - Healthcare/Utilities insurance split — LIC, HDFC Life, ICICI Pru, Star Health, Niva Bupa, Acko, Digit
- [ ] 2.3 Add `src/lib/import/recurrence.ts`
  - `detectRecurring(rows: MappedImportRow[]): RecurrenceHint[]`
  - group by `note_key` else payee; a group recurs when it has >= 2 occurrences, 25-35 days apart, with amounts within 5% of each other
  - `Rent` when expense, recurring, amount is the largest recurring expense and a round thousand
  - `EMI` when expense, recurring, amount is exact to the rupee across occurrences
  - `Salary` when income, recurring, and the largest recurring credit
- [ ] 2.4 Apply recurrence hints in `parse.ts` **after** `buildMappedRows`, only to rows whose `suggested_category_name` is still null
- [ ] 2.5 Cap recurrence-derived confidence at 0.75 so it stays under `IMPORT_LOW_CONFIDENCE_MAX` and always surfaces for review

### Testing checklist

| # | Test | File | Asserts |
|---|---|---|---|
| T2.1 | Keyword table is well-formed | new `keywords.test.ts` | no duplicate keyword across categories; all uppercase; no empty strings |
| T2.2 | Every keyword category exists in seed | `keywords.test.ts` | cross-check against seeded names |
| T2.3 | Keyword count floor | `keywords.test.ts` | >= 350 keywords (guards accidental truncation) |
| T2.4 | Monthly same-amount expense → Rent | new `recurrence.test.ts` | 3 rows, ₹22,000, 30 days apart → Rent |
| T2.5 | Exact-to-rupee recurring → EMI | `recurrence.test.ts` | 3 rows, ₹4,317, 30 days apart → EMI |
| T2.6 | Largest recurring credit → Salary | `recurrence.test.ts` | monthly credit → Salary |
| T2.7 | Two occurrences is enough, one is not | `recurrence.test.ts` | single occurrence yields no hint |
| T2.8 | Irregular spacing is not recurrence | `recurrence.test.ts` | 5 and 50 days apart → no hint |
| T2.9 | Recurrence never overrides a keyword hit | `recurrence.test.ts` | row already categorized stays as-is |
| T2.10 | Recurrence confidence stays reviewable | `recurrence.test.ts` | confidence <= 0.75 |

### Done when

`npm run test:unit` green. Measured auto-categorized share on a real fixture statement
recorded in the PR against the Part 1 number.

---

# Part 3 — Grouping engine and grouped review

The core UX change. New pure module plus a new review surface, wired into the existing
import wizard.

**Ships alone:** every user, new or existing, gets grouped review on their next import.
Onboarding is still untouched.

### Action items

**Engine**

- [ ] 3.1 Add `src/lib/import/group.ts`
  - `type ReviewGroup = { key, keyKind: "note" | "keyword" | "payee", label, rowIds, rowCount, totalPaise, firstDate, lastDate, payees: string[], suggestedCategoryName, confidence, band }`
  - `groupRowsForReview(rows, options): ReviewGroup[]`
  - key priority per D2: `note_key` → keyword category → normalized payee
- [ ] 3.2 Band assignment
  - `settled` — confidence >= `IMPORT_LOW_CONFIDENCE_MAX` (0.8) and a category resolved
  - `needs_input` — everything else above the trivial threshold
  - `trivial` — single occurrence and total under ₹200
- [ ] 3.3 Sort `needs_input` by `totalPaise` descending
- [ ] 3.4 Add `rankCategoriesForGroup(group, categories): Category[]` — returns the 4 chips to show, ranked by kind match, amount shape (round thousands favour Rent/EMI), and direction (income groups never offer expense categories)
- [ ] 3.5 Add `summariseProgress(groups): { settledPaise, totalPaise, pct }`

**Commit path**

- [ ] 3.6 Add `bulkCommitImportRowsFn` to `mutations.functions.ts` — accepts `{ rows: Array<{row_id, suggested_category_id}>, rules: UpsertImportRuleInput[] }`, applies patches in one update per category, commits via RPC, writes rules once. Replaces 100 round trips with a handful.
- [ ] 3.7 Group card category pick writes an `import_rule` with `match_field` derived from `keyKind` — `note` for a note group, `payee` for a payee group, `narration` for a keyword group

**UI**

- [ ] 3.8 Add `src/components/import/teach-screen.tsx` — three bands per D3/D5/D6
  - Band 1 `settled`: one collapsed summary strip with category totals and an expand link
  - Band 2 `needs_input`: one card per group — label, `{n} payments · ₹{total} · {range}`, payee list, 4 category chips plus "Other"
  - Band 3 `trivial`: one strip with a single "Skip these {n}" button
  - Money-denominated progress bar pinned at top
  - "Import anyway" always enabled
- [ ] 3.9 Wire into `import-wizard.tsx` as a view mode alongside the existing deck/table toggle (pending Q1)
- [ ] 3.10 Keep the existing row-level deck reachable — grouping is the default, not the only option

### Testing checklist

| # | Test | File | Asserts |
|---|---|---|---|
| T3.1 | Note key groups across payees | new `group.test.ts` | the two `FAGS` fixtures land in one group |
| T3.2 | Month variants collapse | `group.test.ts` | `RENT MAY` + `RENT JUN` + `RENT JUL` → one group of 3 |
| T3.3 | Keyword groups when no note | `group.test.ts` | Swiggy + Zomato + EatSure → one `Dining` group |
| T3.4 | Payee groups when neither | `group.test.ts` | repeated `Apurvasigamani` with no note → one group |
| T3.5 | Note beats keyword | `group.test.ts` | Swiggy row with note `LUNCH` groups under `LUNCH` |
| T3.6 | Band split is correct | `group.test.ts` | confidence 0.86 → settled; 0.4 → needs_input; single ₹120 → trivial |
| T3.7 | needs_input sorted by money | `group.test.ts` | ₹66,000 group precedes ₹4,320 group with more rows |
| T3.8 | Realistic collapse ratio | `group.test.ts` | 100-row fixture → <= 35 groups |
| T3.9 | Chip ranking respects direction | `group.test.ts` | income group offers no expense category |
| T3.10 | Chip ranking favours shape | `group.test.ts` | ₹22,000 round monthly expense offers Rent first |
| T3.11 | Progress is money-weighted | `group.test.ts` | clearing the top group moves pct more than clearing five small ones |
| T3.12 | match_field derived from keyKind | `group.test.ts` or `stage.test.ts` | note group → `note`; payee group → `payee` |
| T3.13 | Bulk commit writes all rows | new `imports.spec.ts` case | group pick categorizes every row in the group |
| T3.14 | Bulk commit writes one rule per group | e2e | rule count equals groups categorized |
| T3.15 | Import anyway works with zero taps | e2e | all rows commit as Uncategorized, no error |
| T3.16 | Row-level deck still reachable | e2e | toggle switches views, deck behaves as before |

### Done when

A 100-row fixture reaches <= 35 groups, the top 6 groups cover >= 70% of total value, and
`npm run test:unit` plus `npm run test:e2e` are green.

---

# Part 4 — Onboarding route

Wraps Parts 1-3 in a first-run flow.

**Ships alone:** new users get the guided path; existing users are unaffected.

### Action items

- [ ] 4.1 Add `src/routes/onboarding.tsx` with four steps: `account → upload → teach → done`
- [ ] 4.2 Add first-run detection — redirect to `/onboarding` when the user has zero accounts and zero transactions
- [ ] 4.3 Account step — name, type, nothing else. No opening balance field.
- [ ] 4.4 Upload step — reuse the existing parse path including password handling; show detected date range and row count as confirmation, not as a question
- [ ] 4.5 Infer what the statement already states
  - opening balance from the statement's own opening balance row where the mapping has a balance column
  - account type hint from the detected preset
  - date range from parsed rows
- [ ] 4.6 Teach step — render `teach-screen.tsx` from Part 3
- [ ] 4.7 Done step — commit, then a single line: "Next month's statement will mostly sort itself." Route to dashboard.
- [ ] 4.8 "Skip for now" on every step, exiting to the dashboard with whatever is committed (pending Q3)
- [ ] 4.9 Resume — a half-finished onboarding re-entered goes back to the furthest step reached, not to the start

### Testing checklist

| # | Test | File | Asserts |
|---|---|---|---|
| T4.1 | Fresh user is redirected | new `onboarding.spec.ts` | zero accounts → `/onboarding` |
| T4.2 | Existing user is not | `onboarding.spec.ts` | user with accounts goes to dashboard |
| T4.3 | Full happy path | `onboarding.spec.ts` | account → upload → 6 taps → dashboard shows real charts |
| T4.4 | Skip at each step | `onboarding.spec.ts` | three cases, each lands on dashboard without error |
| T4.5 | Password-protected PDF | `onboarding.spec.ts` | prompts in-flow, never uploads the file |
| T4.6 | Opening balance inferred | `onboarding.spec.ts` | account balance matches the statement, with no balance field shown |
| T4.7 | Resume mid-flow | `onboarding.spec.ts` | reload during teach returns to teach, not account |
| T4.8 | Zero-tap finish | `onboarding.spec.ts` | "Import anyway" from teach commits everything |
| T4.9 | Rules persisted | `onboarding.spec.ts` | Settings lists one rule per categorized group, with correct `match_field` |
| T4.10 | Second import is quiet | `onboarding.spec.ts` | re-importing a later month leaves few groups in `needs_input` |

### Done when

A new user reaches a populated dashboard in under 60 seconds and under 10 taps,
measured on the real fixture statement.

---

# Part 5 — Refinement and verification

The smoothness pass, plus the measurement that proves the whole thing worked.

**Ships alone:** polish on a flow that already works.

### Action items

- [ ] 5.1 Card transitions — chosen card animates out, progress bar animates, next card rises
- [ ] 5.2 Undo — a toast after each group pick, reversible for 5 seconds, no confirmation dialogs
- [ ] 5.3 Keyboard path — number keys pick chips, `Enter` accepts, `Esc` skips the group
- [ ] 5.4 Inline category creation on a group card (pending Q2)
- [ ] 5.5 Empty and edge states — statement with no notes at all; statement with one transaction; statement where every row is already categorized (teach step should auto-skip)
- [ ] 5.6 Mobile layout — cards are the primary surface, one-handed reach, 44px touch targets
- [ ] 5.7 Accessibility — chips are real buttons, progress has `aria-valuenow`, bands are landmarks, focus moves to the next card after a pick
- [ ] 5.8 Add `docs/DECISIONS.md` entries for D1-D9
- [ ] 5.9 Update `CLAUDE.md` import pipeline line to name `keywords.ts`, `recurrence.ts`, `group.ts`
- [ ] 5.10 Record the measurement table in the PR

### Testing checklist

| # | Test | Asserts |
|---|---|---|
| T5.1 | Undo restores a group | category reverts, rule is not written |
| T5.2 | Keyboard completes the flow | no mouse, full teach step finished |
| T5.3 | Inline category appears everywhere | new category usable in Settings and transactions |
| T5.4 | No-notes statement | still groups by keyword and payee, no crash |
| T5.5 | Single-transaction statement | teach step renders one card, no division by zero in progress |
| T5.6 | Fully-categorized statement | teach step auto-skips to done |
| T5.7 | Mobile viewport | Playwright at 390×844, no horizontal scroll, targets >= 44px |
| T5.8 | Axe clean | no serious or critical violations on the teach screen |
| T5.9 | Full regression | `npm run test:unit`, `npm run test:e2e`, `npm run lint`, `npm run build` all green |

### Done when

The measurement table below is filled in from a real run.

| Metric | Before (e59e3f0) | After P7 |
|---|---|---|
| Auto-categorized share of rows | | |
| Auto-categorized share of value | | |
| Groups needing input | | |
| Taps to finish | | |
| Taps to cover 80% of value | | |
| Time to populated dashboard | | |

---

## Dependency order

```
Part 1 ──► Part 2 ──► Part 3 ──► Part 4 ──► Part 5
 (pure)    (pure)    (engine+UI)  (route)   (polish)
```

Parts 1 and 2 are independently mergeable and carry no UI risk. Part 3 is the largest and
depends on both. Parts 4 and 5 depend on Part 3.

## Out of scope

- Any ML model — embeddings, browser LLM, or server LLM categorization. D9.
- OCR for scanned PDFs. Still governed by the existing "no OCR" decision in `DECISIONS.md`.
- PDF layout generalization beyond HDFC savings. Separate track.
- Changing the hash formula or the near-duplicate rule.
