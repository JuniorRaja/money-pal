# P1-3 — Merchant extraction quality + per-bank mapping memory

**Phase:** 1 · **Depends on:** P1-2 helps (you'll see the bad rules), not required

## Why

This is what "it learns the new formats of the txn narration" actually reduces to once you
look at the code. Two concrete defects, both bounded and testable — unlike inferring
regexes from examples, which is argued against in the [README](README.md#two-things-deliberately-not-being-built).

## Part A — merchant extraction

Rules key off `extractMerchant()` output (`src/lib/import/heuristics.ts`), so a bad
extraction produces a rule key that never matches again. The current ladder: UPI VPA handle
(`@ybl|okaxis|…`) → `UPI[-/]` → `NEFT` → `IMPS` → `POS` → first token before `-/,`, then
strips ref numbers (`\d{5,}`) and stacked rail prefixes
(`RAIL_PREFIX = /^(?:UPI|NEFT|IMPS|ACH|POS|ATM|RTGS|MMT|CMS|P2P|P2A|PCD|INF)\b/i`), then
title-cases.

DECISIONS #21 already settles the philosophy: a reference number is not a merchant, and an
empty result should fall to confidence 0.2 and show the raw narration rather than guess.
Keep that. The work is coverage:

- Extend the VPA handle list (`@paytm`, `@ibl`, `@axl`, `@apl`, `@sbi`, `@upi`, …).
- Handle the stacked-rail cases the current ladder still leaves as junk.
- Collect real narrations from your own statements as fixtures — this is tuning against
  actual data, not inventing cases.

`src/lib/import/heuristics.test.ts` already exists and covers the hyphenated-UPI regression
and rails-only narration. Extend it; every new handle gets a case.

## Part B — mapping memory (the real "new format" fix)

DECISIONS #17 records an accepted limitation:

> `import_profiles` unique on `(user_id, account_id, bank_preset)` — every unrecognised bank
> maps to `custom`, so **a second custom bank on one account overwrites the first mapping**.
> Fix needs a header-signature column in the key.

That is exactly the bug you experience as "it forgot the format". The fix is the one
DECISIONS already names.

### Files

- `supabase/migrations/<timestamp>_import_profile_header_signature.sql` — **new.** Add
  `header_signature text` to `import_profiles`; change the unique index to
  `(user_id, account_id, bank_preset, header_signature)`.
- `src/lib/import/presets.ts` — compute the signature.
- `src/lib/mutations.functions.ts` — `upsertImportProfileFn` passes it through.
- `src/lib/import/stage.ts` / `import-wizard.tsx` — look up by signature.

### Steps

1. Signature = a stable hash of the **normalised header row** — reuse `normalizeHeader()`
   from `normalize.ts`, sort or keep order (pick one and document it), hash with the
   existing `sha256Hex()` from `hash.ts`. Do not add a hashing dependency.
2. Backfill existing rows with the signature of their stored mapping's headers, or leave
   null and treat null as "legacy, matches anything" — decide and write it in the migration
   comment.
3. On import, look up the profile by signature first, falling back to the old key so
   existing saved mappings keep working.
4. Update DECISIONS #17 to record that the limitation is now fixed and how.

## Done when

- Two different unrecognised banks, both imported to the same account, each keep their own
  column mapping across imports.
- A statement whose columns you mapped once is never re-asked.
- `heuristics.test.ts` covers every VPA handle and rail prefix added, and
  `presets.test.ts` still passes unchanged.

## Out of scope

Auto-generating narration regexes. Auto-detecting a *new* bank's preset — `custom` plus
remembered mapping is the answer, and it now works properly.
