# Audit: the auto-categorization chain

Audited at commit `c402553` (main). Every `file:line` below was checked against that commit. Examples marked
"run" were produced by calling `applyHeuristics` / `groupRowsForReview` directly on the sample string.
Examples marked "read" come from reading the code only.

Scope: how a staged statement row gets a category, which numbers steer that, where it breaks, and how to
measure coverage on a real statement. No code changes. Settled rules in `docs/DECISIONS.md` ("Import — AI
categorization is optional and progressive", "Import — review queue kinds") are taken as given.

## 1. Resolution order for a staged row

Precedence, highest first: **import rule > note keyword > narration keyword > recurrence propagation > AI chip > review band**.
Execution order differs from precedence for the first three, so both are shown. Stages 1-3 run per row, once,
before the row is stored. Stages 4-6 run per group, in the browser, every time the review screen is built.

| # | Stage | Runs when | Where | What it does |
|---|-------|-----------|-------|--------------|
| 0 | Parse + heuristics | Statement is parsed, client-side | `src/lib/import/parse.ts:145` (`buildMappedRows`), call at `parse.ts:155` -> `src/lib/import/heuristics.ts:132` (`applyHeuristics`) | Extracts payee (`heuristics.ts:137`), note (`heuristics.ts:138`), note key (`heuristics.ts:139`) and runs stages 2 and 3 below. |
| 2 | Note keyword | Inside stage 0 | `heuristics.ts:140` (`matchRule` at `heuristics.ts:102`) | Matches the normalized note against `KEYWORD_RULES`. Wins over the narration keyword (`heuristics.ts:141`, `heuristics.ts:142`). Confidence = rule confidence + 0.06, capped at 0.95 (`heuristics.ts:152`). `matched_on: "note"` (`heuristics.ts:151`). |
| 3 | Narration keyword | Inside stage 0, only if stage 2 missed | `heuristics.ts:141` (haystack built at `heuristics.ts:136`; upper-cased by `src/lib/import/normalize.ts:39`) | Substring match against the whole narration. Confidence = rule confidence unchanged. `matched_on: "narration"`. |
| 3b | Heuristic fallback | Neither keyword stage hit | `heuristics.ts:156-166` (payee of 3+ chars, confidence 0.4), `heuristics.ts:168-176` (confidence 0.2) | No category. The row is staged with `suggested_category_name: null`. |
| 1 | Import rule | Rows are staged | `src/lib/import/stage.ts:115` (`toStageDrafts`), call at `stage.ts:136`; `applyImportRules` at `stage.ts:86` -> `findImportRule` at `stage.ts:65` | Overrides the heuristic: `suggested_category_id: fromRule ?? fromName` at `stage.ts:152`. Only active rules (`stage.ts:70`); account-scoped before global (`stage.ts:71`, `stage.ts:72`); first rule whose pattern is a substring of the chosen field wins (`stage.ts:81`). Confidence floored at 0.9 (`stage.ts:153`). Rules are passed in by `src/components/import/import-wizard.tsx:232` (from `boot.rules`, `src/components/import/pipeline-modal.tsx:196`). |
| 1b | Category name to id | Same step | `stage.ts:141` (`fromName`), `categoryIdByName` at `stage.ts:52` | The keyword category is a name. It becomes an id only if the user has a category with that name, case-insensitive. Otherwise the id is `null` but the confidence is kept (see failure mode F8). |
| 4 | Recurrence propagation | Review screen is built | `src/lib/import/teach.ts:36` (`detectRecurring`, `src/lib/import/recurrence.ts:64`), `teach.ts:37` (`propagateRecurringCategories`, `recurrence.ts:94`) | Copies a keyword-resolved row's category onto its unresolved siblings in the same recurrence shape (`recurrence.ts:109`, `recurrence.ts:113-119`). Never invents a category (`recurrence.ts:63`). |
| 5 | AI suggestion | Review screen mounts, AI on | Client: `src/components/onboarding/teach-screen.tsx:66-69` (unresolved groups), `teach-screen.tsx:93-131` (effect), call at `teach-screen.tsx:113`. Server: `src/lib/categorize.functions.ts:118` (`categorizeGroupsFn`) -> `src/lib/import/categorize.ts:169` (`requestCategorizationWithRetry`) | Sends only needs-input groups that have no category. The answer only reorders the category chips (`teach-screen.tsx:491-509`, `teach-screen.tsx:486`). It never assigns a category. The user must click it. |
| 6 | Review band | Review screen is built | `src/lib/import/group.ts:107-112` (`band`), grouping at `src/lib/import/teach.ts:38` | `settled` / `trivial` / `needs_input` per group. |
| 7 | Commit | User presses "Import anyway" | `src/routes/imports/$jobId.tsx:75-88` (same logic in `src/components/import/pipeline-modal.tsx:133-146` and `src/routes/onboarding.tsx:180-206`) | A group gets a category only if the user picked one, or its band is `settled` (`$jobId.tsx:81-82`). Every row in the group gets that category (`$jobId.tsx:85-88`). Everything else is committed uncategorised (`suggested_category_id: null`; allowed since `supabase/migrations/20261108130000_bulk_import_uncategorized.sql:1`). |

Notes on the order:

- The review screen does not read stage-1 or stage-3 results from memory. It rebuilds each row from the stored
  row: category name from `suggested_category_id` (`teach.ts:12-14`), `confidence` from the stored value
  (`teach.ts:33`), and re-runs `applyHeuristics` only to recover `matched_on` (`teach.ts:11`, `teach.ts:24-27`).
- A rule-resolved row whose category differs from the heuristic gets `matched_on: null` (`teach.ts:24-27`). It
  therefore does not seed recurrence propagation (`recurrence.ts:109` requires `matched_on`).
- `GroupSource` has `"rule"` and `"ai"` values (`group.ts:7`) but nothing sets `row.source`
  (`teach.ts:8-38`). The UI never reads `group.source`. A rule-resolved group is labelled `"recurrence"` by
  `group.ts:129-130`. The stage that resolved a group is therefore not visible in the UI.
- `unresolvedCategorizationGroups` (`categorize.ts:163`) exists and is tested, but `teach-screen.tsx` does its own
  filter (`teach-screen.tsx:66-69`).
- `src/components/import/review-deck.tsx` and `review-table.tsx` also read `IMPORT_LOW_CONFIDENCE_MAX`
  (`review-deck.tsx:378`, `review-table.tsx:82`) but nothing under `src/` imports either file. The live review
  UI is `TeachScreen`.

### The review band (stage 6)

`group.ts:107-112`, evaluated per group. A group's confidence is that of its highest-confidence resolved row
(`group.ts:100-102`).

1. `settled`: has a resolved row and confidence >= 0.8 (`group.ts:108`).
2. `trivial`: not settled, exactly one row, and total under 20,000 paise = Rs 200 (`group.ts:110`).
3. `needs_input`: everything else (`group.ts:112`).

How a group is keyed (`group.ts:52-67`): note key first, else the keyword category name, else payee.

## 2. Keyword rules (`src/lib/import/keywords.ts`)

`KEYWORD_RULES` is declared at `keywords.ts:9`. **16 rules = 16 categories, 528 keywords in total.** All 16
names match the seeded categories (`supabase/migrations/20260811150500_seed_categories_and_profile_trigger.sql`
for 15, `supabase/migrations/20261108100000_seed_insurance_category.sql:2` for Insurance).

Matching (`heuristics.ts:102-115`): rules are tried in array order, so the **first rule with any matching
keyword wins**, not the highest-confidence one. A rule with a `type` is skipped for the other direction
(`heuristics.ts:107`). Matching is a plain substring test (`heuristics.ts:109`), with no word boundary.

| Order | Category | Keywords | Confidence | Direction | Rule starts at |
|------:|----------|---------:|-----------:|-----------|----------------|
| 1 | Salary | 6 | 0.92 | income only | `keywords.ts:11` |
| 2 | Interest | 6 | 0.88 | income only | `keywords.ts:17` |
| 3 | Dining | 50 | 0.86 | expense only | `keywords.ts:30` |
| 4 | Groceries | 39 | 0.86 | expense only | `keywords.ts:87` |
| 5 | Transport | 57 | 0.84 | expense only | `keywords.ts:133` |
| 6 | Shopping | 55 | 0.84 | expense only | `keywords.ts:197` |
| 7 | Entertainment | 46 | 0.84 | expense only | `keywords.ts:259` |
| 8 | Utilities | 52 | 0.80 | expense only | `keywords.ts:312` |
| 9 | Healthcare | 44 | 0.82 | expense only | `keywords.ts:371` |
| 10 | Travel | 49 | 0.82 | expense only | `keywords.ts:422` |
| 11 | Investments | 46 | 0.80 | expense only | `keywords.ts:478` |
| 12 | EMI | 25 | 0.80 | expense only | `keywords.ts:531` |
| 13 | Insurance | 34 | 0.82 | expense only | `keywords.ts:563` |
| 14 | Rent | 6 | 0.90 | expense only | `keywords.ts:604` |
| 15 | Transfer | 6 | 0.86 | **both** (no `type`) | `keywords.ts:617` |
| 16 | Freelance | 7 | 0.86 | income only | `keywords.ts:629` |

Observations that follow from the table:

- No keyword rule is below 0.8. Utilities, Investments and EMI sit exactly on the threshold, and 0.8 passes
  `>= 0.8` (`group.ts:108`) and fails `< 0.8` (`src/data/live.ts:732`). So "below the 0.8 threshold" is
  equivalent to "no rule and no keyword matched".
- With the note bonus the effective maximum is 0.95 (Salary note hit: 0.92 + 0.06 is capped).
- Ordering matters: Dining is before Groceries and EMI is before Insurance. Among expense rules only Transfer is
  checked after Rent.

## 3. Hard-coded numbers that affect categorisation

| Number | Meaning | Where |
|--------|---------|-------|
| `IMPORT_LOW_CONFIDENCE_MAX = 0.8` | The single "low confidence" threshold. Used for the hub's "Unknown merchant" queue. | Defined `src/data/schema.ts:323`; used `src/data/live.ts:732` |
| `0.8` (literal) | Settled cut-off in the review band. **Not** the constant above. | `src/lib/import/group.ts:108` |
| `0.75` | AI confidence cap. | `src/lib/import/categorize.ts:123` |
| `+ 0.06`, cap `0.95` | Note-match confidence bonus and its ceiling. | `src/lib/import/heuristics.ts:152` |
| `0.4` | Fallback confidence: payee of 3 or more chars, no keyword. | `heuristics.ts:164` (guard at `heuristics.ts:156`) |
| `0.2` | Fallback confidence: payee shorter than 3 chars or empty. | `heuristics.ts:175` |
| `5` | `extractNote` returns `null` if the narration has fewer than 5 hyphen-separated segments. | `heuristics.ts:81` |
| `1` row and `20_000` paise | `trivial` band: single-row group under Rs 200. | `group.ts:110` |
| `0.9` | Floor for a row resolved by an import rule. | `src/lib/import/stage.ts:153` |

Other numbers that change outcomes, for completeness:

| Number | Meaning | Where |
|--------|---------|-------|
| 2 to 60 chars | Note length window; also must contain a letter. | `heuristics.ts:84-85` |
| `\d{6,}` | A final segment with 6 or more digits is not a note. | `heuristics.ts:65` |
| `\d{5,}` | Words with 5 or more digits are dropped from the payee. | `heuristics.ts:16` |
| 3 to 48 chars | Length window for the first-segment payee fallback; raw-narration payee is cut to 48. | `heuristics.ts:52`, `heuristics.ts:57`, `heuristics.ts:169` |
| 1 to 40 chars | UPI-handle payee name length. | `heuristics.ts:33` |
| 2 or more rows | Minimum group size for a recurrence shape. | `src/lib/import/recurrence.ts:80` |
| 25 to 35 days | "Monthly" cadence window. | `recurrence.ts:45` |
| 2% | "Near" amount stability. | `recurrence.ts:29` |
| 1 | Confidence of a category the user explicitly approved (propagation). | `recurrence.ts:117` |
| 1.1 | Sort weight for monthly groups in `needs_input`. | `group.ts:76` |
| 4 | Number of category chips shown per group. | `group.ts:191` |
| 5 new categories, 40 chars | AI limits. | `categorize.ts:129`, `categorize.ts:131` |
| 8,000 ms, 2 attempts | AI timeout and retry count. | `categorize.ts:177`, `categorize.ts:179` |
| 200 groups, 100-char label | AI request limits. | `src/lib/categorize.functions.ts:23`, `categorize.functions.ts:33` |
| 200 rows | Hub queue length. | `src/data/live.ts:873` |
| 200 (Rs) in copy | UI text repeats the trivial threshold. | `src/components/onboarding/teach-screen.tsx:428` |

The AI confidence cap has no effect on assignment today. `teach-screen.tsx` never reads `suggestion.confidence`.
A group can only be settled by a row at 0.8 or above, and an AI answer is capped at 0.75, so an AI answer cannot
settle a group even by accident.

## 4. Failure modes

Each one names the stage that fails. "run" means the output was obtained by calling the function.

**F1. Note dropped: fewer than 5 segments.** Stage: note extraction (`heuristics.ts:81`).
`UPI-RAJU-RAJU@OKSBI-GYM FEES` has 4 segments, so `extractNote` returns `null` (run). The typed note "GYM FEES"
never reaches the note keyword stage, the group label, or the AI. The row falls to payee `Raju`, confidence 0.4.
The same narration with a bank code and reference (`UPI-RAJU-RAJU@OKSBI-HDFC0001234-411111111111-GYM FEES`)
keeps note `GYM FEES` (run).

**F2. Payee reduced to `""` by the reference-number filter.** Stage: payee extraction (`heuristics.ts:16`, `heuristics.ts:57`).
`IMPS P2P 622157719873#09` -> `extractMerchant` returns `""` (also asserted at `src/lib/import/heuristics.test.ts:26`).
`applyHeuristics` falls through to confidence 0.2 and uses the raw narration as payee (`heuristics.ts:169`).
The group key is that payee (`group.ts:65`), and it contains a unique reference number, so every such row is its
own group. These rows can never form a recurrence shape or share a decision.

**F3. Bank rail not in the rail list.** Stage: payee extraction (`heuristics.ts:6`).
`NACH-BAJAJ FINANCE LTD-0000123` -> payee `Nach`, no keyword ("BAJAJ FINSERV" is the only Bajaj finance keyword,
`keywords.ts:538`), confidence 0.4 (run). `NACH` is not in `RAIL_PREFIX`, so the first segment is the payee. Every
NACH debit then shares the payee group `NACH` (`group.ts:65-66`), mixing EMIs, insurance and SIP mandates under
one label, and the AI sees the label `Nach`.

**F4. Person-to-person payment deliberately left uncategorised.** Stage: keyword + AI, by design.
`UPI-RAMESH KUMAR-9876543210@ybl-SBIN0001234-411111111111` -> payee `Ramesh Kumar`, no category, 0.4 (run). The AI
prompt tells the model to return null for person-to-person payments (`categorize.ts:36`). Nothing in the chain
will categorise it without a user choice or a typed note. A note changes that: the same narration ending in `-RENT`
is Rent at 0.95 (run).

**F5. Substring false positive at high confidence.** Stage: narration keyword (`heuristics.ts:109`, rule `keywords.ts:610`).
`UPI-PARENTS-PARENTS@OKSBI-HDFC0001234-411111111111` -> **Rent, 0.9** (run), because "PARENTS" contains "RENT".
`UPI-CURRENT BILL-CESC@YBL-HDFC0001234-411111111111` -> **Rent, 0.9** (run), an electricity bill that should be
Utilities. At 0.9 these groups are `settled`, skip review, are committed as Rent, and `onImportAnyway` writes an
import rule for them (`$jobId.tsx:89-98`). This is the one failure that is both silent and sticky.

**F6. Group-level category overrides row-level evidence.** Stage: grouping + commit (`group.ts:57-58`, `group.ts:100-102`, `$jobId.tsx:85-88`).
`UPI-ZOMATO-ZOMATO@PAYTM-HDFC0001234-123456789012-FOOD` (Rs 350) and `UPI-OLA-OLA@PAYTM-HDFC0001234-411111111111-FOOD`
(Rs 250) both carry the note `FOOD`. They fall into one note group (label `FOOD`). Zomato resolves to Dining
0.86, Ola to Transport 0.84 (run). The group takes the higher-confidence row, becomes `settled` as Dining, and the
cab ride is committed as Dining.

**F7. Small spends are never categorised.** Stage: review band (`group.ts:110`).
`UPI-M O COOL BAR-Q693365448@YBL-YESB0YBLUPI-192342317477-TEA` for Rs 40 -> note `TEA`, no keyword, 0.4 (run). A
single-row group under Rs 200 is `trivial`, is not shown as a card (`teach-screen.tsx:62-64`), and gets no category
at commit (`$jobId.tsx:81-82`). Any small everyday spend with no keyword (tea, snacks, autos) lands here. How large this share is on a real
statement is exactly what section 5 measures.
"Skip these" (`teach-screen.tsx:430-431`) only hides the notice; the rows are committed uncategorised either way.

**F8. Keyword category the user does not have.** Stage: name-to-id (`stage.ts:141`, `stage.ts:52`, `stage.ts:153`).
Read, not run. If the user deleted or renamed "Dining", a Swiggy row stages with `suggested_category_id: null`
but confidence 0.86. The hub then files it under "Needs review" rather than "Unknown merchant"
(`live.ts:732-735`), while the review screen treats the group as unresolved (`teach.ts:12-14`, `teach.ts:33`).
The two queues disagree about the same row.

**F9. Keyword-keyed groups learn a rule whose pattern is the category name.** Stage: commit (`group.ts:61-62`, `group.ts:213-214`, `$jobId.tsx:89-98`).
`UPI-ZOMATO-ZOMATO@PAYTM-123` (4 segments, so no note) is resolved by keyword. Its group has `keyKind: "keyword"`,
`key: "DINING"` and `matchFieldForGroup` returns `"narration"` (run). On "Import anyway" the saved rule is
pattern `DINING` against the narration field. That pattern is unlikely to appear in a real narration, so the learned rule
is unlikely to help the next statement.

**F10. First matching rule wins, not the best one.** Stage: narration keyword (`heuristics.ts:106-113`).
`POS 123456 SWIGGY INSTAMART` -> Dining 0.86 (run), although "INSTAMART" is a Groceries keyword
(`keywords.ts:95`): Dining is earlier in the array and "SWIGGY" matches first. With a note `GROCERIES` the same
merchant becomes Groceries 0.92 (run), so the outcome depends on whether a note was typed.

**F11. No rule for cash.** Stage: keyword.
`ATM-CASH WDL-123456-CHENNAI` -> payee `Cash`, no category, 0.4 (run). `KEYWORD_RULES` has no cash or ATM
keyword and no "Cash" category rule.

## 5. Coverage measurement (for PR to run on a real statement)

The review screen does not report coverage directly, and it does not show which stage resolved a group
(`group.source` is never read, see section 1). The protocol below uses only numbers the UI shows today. Nothing
here needs code changes.

Definitions used below:

- **Auto-categorised at commit**: rows that end up with a category without the user picking one. That is rows in
  groups whose band is `settled` (`$jobId.tsx:81-82`).
- **Group bands**: `settled`, `trivial`, `needs_input` (`group.ts:8`).
- **Below threshold**: a staged row with confidence under 0.8 (`live.ts:732`). By section 2 that means no rule
  and no keyword hit.

### Steps

Use one real statement per bank, a fresh upload, and note the row count from the file itself (statement rows
that are duplicates of earlier imports are skipped and will not be staged).

1. In **Settings -> Assistant** (`src/routes/settings.tsx:222`), turn **AI import suggestions** off. This gives the
   deterministic chain: rules, keywords, recurrence. (Turn it back on at step 7.)
2. Import the statement (Import Center -> upload) and stop when the review screen ("Teach your statement")
   appears. Do **not** press "Import anyway".
3. **Rows staged and rows below 0.8.** Close the review and open the Import Center hub (ideally with no other
   statement waiting, since the panel lists every open job)
   (`src/routes/imports/index.tsx`). In the "Waiting for you" panel, read the total ("N rows", `index.tsx:213`)
   and the count next to each section: "Unknown merchant" (rows below 0.8, `index.tsx:100`, count at
   `index.tsx:558`), "Needs review" (rows at 0.8 or above) and "Held". Record them. The hub lists at most 200
   rows (`live.ts:873`); if the statement has more than 200 staged rows, only the first 200 by date are counted.
   Record the date range you read, or split the statement.
4. **Groups per band.** Reopen the job's review. Read from the screen:
   - total groups: "N groups" (`teach-screen.tsx:283`);
   - settled groups: "N groups already sorted" (`teach-screen.tsx:289`);
   - trivial groups: "N small payments under Rs 200" (`teach-screen.tsx:428`);
   - needs-input groups: the number of cards under "Groups needing input" (`teach-screen.tsx:304`). If counting
     is awkward, use total minus settled minus trivial.
5. **Rows per band.** Each needs-input card shows "N payments" (`teach-screen.tsx:335`). Add them to get the
   needs-input row count. Expanding "groups already sorted" (`teach-screen.tsx:287`) lists categories and
   rupee totals, not row counts, so the settled row count is: rows staged (step 3) minus needs-input rows minus
   trivial rows (trivial groups are single-row, so trivial rows = trivial groups).
6. **Auto-categorised at commit** = settled rows from step 5. Note the "x of y sorted" bar at the bottom
   (`teach-screen.tsx:442-444`) is by rupee value and counts `trivial` as sorted (`group.ts:201`), so it
   overstates coverage. Record it, but do not use it as the headline number.
7. Optional, AI on: turn the setting on, reopen the review, wait a few seconds, and count the cards that show a
   chip prefixed "AI ·" (`teach-screen.tsx:486`) or a chip starting "+ " (a proposed new category,
   `teach-screen.tsx:482`). That is the number of needs-input groups for which the AI offered something. Do not
   press the chips; the AI never assigns on its own.
8. Before leaving, check the **settled** groups for wrong categories. The expanded "groups already sorted" list
   shows category names and rupee totals only, not group labels, so this is coarse: note any category whose
   total looks too large or does not belong on this statement (for example Rent on a statement with no rent).
   The chain can be confidently wrong (F5, F6), and this is the only precision signal the UI gives.
9. Press "Import anyway", or "Done for now" to leave the statement staged. Leave all choices as they are.

### Results table (fill in one row per bank / statement; empty on purpose)

| Bank / preset | Statement period | Rows staged | Rows below 0.8 ("Unknown merchant") | Rows at or above 0.8 ("Needs review") | Groups total | Groups settled | Groups trivial | Groups needs_input | Rows in needs_input | Auto-categorised at commit (rows) | Auto-categorised % of rows staged | Groups with an AI chip (AI on) | Settled categories that look wrong |
|---------------|------------------|------------:|------------------------------------:|--------------------------------------:|-------------:|---------------:|---------------:|-------------------:|--------------------:|----------------------------------:|----------------------------------:|-------------------------------:|---------------------------------:|
|               |                  |             |                                     |                                       |              |                |                |                    |                     |                                   |                                   |                                |                                  |
|               |                  |             |                                     |                                       |              |                |                |                    |                     |                                   |                                   |                                |                                  |
|               |                  |             |                                     |                                       |              |                |                |                    |                     |                                   |                                   |                                |                                  |

Reading the result: auto-categorised % is the headline. "Rows at or above 0.8" is the row-level count after
rules and keywords only (stored confidence, before recurrence propagation). The difference between it and
"auto-categorised" comes from recurrence propagation (stage 4) and from group-level application (F6), and the
UI cannot split the two.

## 6. Discrepancies with the ticket

- **Order of stages.** The ticket lists `import_rules` first. In code, heuristics (note, then narration keyword)
  run first at parse time (`parse.ts:155`) and rules run second at staging (`stage.ts:136`), but the rule result
  takes precedence (`stage.ts:152`). Section 1 documents both.
- **AI is not a resolution stage.** It only reorders chips (`teach-screen.tsx:486`, `teach-screen.tsx:491-509`).
  It cannot categorise a row, which matches DECISIONS ("a user must select a suggestion").
- **Recurrence runs at review time, not at staging.** `detectRecurring` and `propagateRecurringCategories` are
  called only from `teach.ts:36-37` (and tests). The hub's confidence counts never include propagation.
- **"Review band" is two things.** The group band (`group.ts:107-112`) is what the review screen uses. The hub
  queue kind (`live.ts:730-735`) is a separate, row-level classification that uses the 0.8 constant.
- **Single threshold, two spellings.** DECISIONS says 0.8 is "the single threshold". The constant is used in
  `live.ts:732`, but `group.ts:108` hard-codes a second `0.8`. They agree today; they will drift if one changes.
- **Note-match "bonus".** It exists, but it is additive +0.06 capped at 0.95 (`heuristics.ts:152`), not a
  fixed confidence.
- **Hub name.** DECISIONS and a schema comment (`schema.ts:322`) call the hub queue "Needs your eye". The
  panel in the UI is titled "Waiting for you" (`index.tsx:210`).
- **Stage visibility.** The ticket assumes the resolution stage can be counted per row. `GroupSource` suggests
  it, but `rule` and `ai` are never set and the UI never reads it, so per-stage coverage cannot be measured
  without a code change (out of scope for this ticket).

## 7. Open questions for PR

1. Is a confidently wrong category (F5, F6) worse than an uncategorised row? That decides whether the measurement
   should weight precision over coverage.
2. Should the Rs 200 `trivial` cut-off (F7) stay, given that small day-to-day spends are the likeliest to be left
   uncategorised?
3. Which banks and which statement months should be measured first, and does a "good" result mean the
   auto-categorised % is above a target you have in mind?
