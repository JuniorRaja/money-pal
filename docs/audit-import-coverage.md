# Import Coverage Audit — Statement Formats and Narration Fields (PRD #6)

_Audited: 2026-11-27 against `main` at c402553. Scope: which statement files and which
narration fields the import pipeline in `src/lib/import/` can read today. Read-only: no
behaviour was changed, and nothing here is a proposal to change it._

Every claim below comes from reading the named file and function. Where the code does not settle
something, it says so and the point is repeated under [Questions for PR](#questions-for-pr).
No sample statement from a real bank was available to this audit, so nothing here was checked
against a real file.

## Headline finding

The pipeline has **one** row reader and three ways of getting a file into it. `parseFileToGrid`
in [parse.ts](../src/lib/import/parse.ts) turns CSV, Excel, or PDF into a `string[][]` grid, and
`parseImportGrid` maps that grid. After the grid, the three formats are identical. They are not
equally _tuned_:

- Three bank layouts have a preset (`hdfc_savings`, `hdfc_cc`, `dbs`). Everything else goes through
  the generic `custom` mapper.
- CSV has test fixtures for all three presets. Excel has a fixture for HDFC savings only. PDF has a
  fixture for HDFC savings only.
- Nothing reads a scanned PDF.

## Presets

Defined in `BANK_PRESETS` and `BANK_PRESET_IDS` in [presets.ts](../src/lib/import/presets.ts).
`custom` is a valid `BankPresetId` and a Postgres `bank_preset` enum value, but it has no entry in
`BANK_PRESETS`; its mapping is produced by `guessMapping` instead.

| Preset id | Label | Date format | `unsignedAmountMeans` | Amount shape the preset expects |
| --- | --- | --- | --- | --- |
| `hdfc_savings` | HDFC NetBanking (Savings) | `DMY` | `signed` | Separate debit and credit columns |
| `hdfc_cc` | HDFC Credit Card | `DMY` | `expense` | One amount column, optional Cr/Dr column |
| `dbs` | DBS | `auto` | `signed` | Separate debit and credit columns |
| `custom` | Custom mapping | `auto` (from `guessMapping`) | `signed` (from `guessMapping`) | Whatever the user maps |

`unsignedAmountMeans` only matters when a single amount column is used and no Cr/Dr column
classifies the row (`resolveDirectedAmount` in [map.ts](../src/lib/import/map.ts)). With separate
debit and credit columns it is not consulted. For `hdfc_cc`, `expense` means a positive amount is
money out and a negative amount is money in (a payment or refund). The user can change both
`dateFormat` and `unsignedAmountMeans` in the mapping editor; `asColumnMapping` in
[stage.ts](../src/lib/import/stage.ts) accepts `auto`, `DMY`, `YMD`, `MDY` and `signed`,
`expense`, `income` when a saved mapping is read back. The editor itself
([mapping-editor.tsx](../src/components/import/mapping-editor.tsx)) offers only Auto, DMY and MDY,
per DECISIONS "Import — amount and date parsing"; `YMD` is accepted on read but cannot be picked
in the UI.

### What `detectBankPreset` needs to score >= 6

`detectBankPreset` scores each of the three first-class presets with `scorePreset` and returns the
highest, or `null` when the best score is below 6. Ties go to the earlier preset in the order
`hdfc_savings`, `hdfc_cc`, `dbs`, because the comparison is a strict `>`. Header text is compared
after `normalizeHeader` (lower-case, punctuation collapsed to a space), so `Credit / Debit` matches
the alias `credit debit`.

Points: date alias +2, description alias +2, debit **and** credit alias both present +3, amount
alias +2, Cr/Dr alias +1, balance alias +1.

| Preset | Maximum | Smallest header sets that reach 6 | Aliases that count |
| --- | --- | --- | --- |
| `hdfc_savings` | 8 | Date + description + debit + credit (7). Or description + debit + credit + balance (6). Or date + debit + credit + balance (6). | Date: `date`, `txn date`, `transaction date`. Description: `narration`, `description`, `particulars`. Debit: `debit amount`, `debit`, `withdrawal`. Credit: `credit amount`, `credit`, `deposit`. Balance: `closing balance`, `balance`. |
| `hdfc_cc` | 7 | Date + description + amount (6). A Cr/Dr column adds 1 (7). | Date: `transaction date`, `date`, `tran date`. Description: `transaction description`, `description`, `narration`. Amount: `amount`, `amount inr`, `amount inrs`. Cr/Dr: `credit debit`, `credit debit indicator`, `cr dr`, `type`. |
| `dbs` | 8 | Date + description + debit + credit (7). Or description + debit + credit + balance (6). Or date + debit + credit + balance (6). | Date: `transaction date`, `txn date`, `date`. Description: `transaction description`, `description`, `statement`, `particulars`. Debit: `debit`, `debit amount`, `withdrawal`. Credit: `credit`, `credit amount`, `deposit`. Balance: `account balance`, `available balance`, `balance`. |

Consequences read directly from the scoring code:

- `hdfc_cc` has no debit or credit aliases, so a credit card file that uses separate debit and
  credit columns cannot score as `hdfc_cc` (it can still score as `hdfc_savings` or `dbs`, which
  would map it with the wrong date format and label).
- `hdfc_savings` and `dbs` overlap heavily. A header row of `Date`, `Description`, `Debit`,
  `Credit`, `Balance` scores 8 on both and resolves to `hdfc_savings` by the tie rule.
- Detection is on headers only. The bank's name is not read from the file for scoring.
  [match-accounts.ts](../src/lib/import/match-accounts.ts) reads the filename and headers for
  account suggestions (`needlesFromText`), but that does not change the preset.
- Header discovery comes first. `findHeaderRowIndex` scans the first 40 rows for one where
  `rowLooksLikeHeader` is true: a date alias, a description alias, and at least 3 alias hits in
  total (balance aliases are not counted). If none is found it returns row 0.
- A preset with an empty alias list falls back to the generic lists in `mappingFromPreset` (for
  example `hdfc_savings` has no `amountAliases` and uses the generic `AMOUNT_ALIASES`).

### `custom` and the generic mapper

`resolveMapping` in [parse.ts](../src/lib/import/parse.ts) picks a mapping in this order: an
explicit `options.mapping`; a requested non-custom preset; `detectBankPreset`; then `guessMapping`.
`guessMapping` matches headers against generic alias lists (`DATE_ALIASES`, `DESCRIPTION_ALIASES`,
`DEBIT_ALIASES`, `CREDIT_ALIASES`, `AMOUNT_ALIASES`, `CRDR_ALIASES`, `BALANCE_ALIASES`), with
`dateFormat: "auto"` and `unsignedAmountMeans: "signed"`. `validateMapping` in
[map.ts](../src/lib/import/map.ts) then requires a date column, a description column, and either
debit+credit columns or one amount column.

DECISIONS "Import — bank presets": "Other Indian banks use the generic mapper (`custom`)."

## Input formats

DECISIONS "Import — CSV/Excel in the browser": CSV and Excel (`.xlsx` / `.xls`) are parsed **in
the browser**, the original file is never uploaded or stored, and only parsed staging rows persist.
DECISIONS "Import — PDF statements": PDF text-layer extraction feeds the same pipeline, still in
the browser. The upload control accepts `.csv`, `.xlsx`, `.xls`, `.pdf`
([file-drop.tsx](../src/components/import/file-drop.tsx)).

**Format is detected from the file's first bytes, not its extension.** `detectFileType` in
`parse.ts` checks for the OLE2 signature (`.xls`), a ZIP signature (`.xlsx`), and `%PDF`. A PDF
signature or a `.pdf` name goes to the PDF reader; an `.xls`/`.xlsx` signature or name goes to
the workbook reader; everything else is decoded as text and read as CSV. The code comment gives the
reason: banks export spreadsheets with the wrong extension.

### CSV

- **Module:** `gridFromCsv` and `decodeText` in [parse.ts](../src/lib/import/parse.ts), using
  Papa Parse with delimiter auto-detection and `skipEmptyLines: false`. `decodeText` tries UTF-8
  and falls back to windows-1252 if the result contains U+FFFD.
- **Tuned layouts:** `hdfc_savings`, `hdfc_cc`, `dbs`. The fixtures in
  [presets.test.ts](../src/lib/import/presets.test.ts) are `HDFC_SAVINGS_CSV`, `HDFC_CC_CSV`, and
  `DBS_CSV`; the HDFC savings fixture starts with junk lines above the header, which
  `findHeaderRowIndex` skips.
- **Other banks:** read through `guessMapping`, only if their headers use aliases from the generic
  lists. Otherwise the user maps columns by hand.
- **DECISIONS:** "Import — CSV/Excel in the browser"; "Import — bank presets".

### Excel (`.xls` / `.xlsx`)

- **Module:** `gridFromWorkbook` in `parse.ts`, using the `xlsx` package (SheetJS, pinned to the
  SheetJS CDN per DECISIONS "Import — Excel parsing comes from the SheetJS CDN"). It reads
  `SheetNames[0]`, the **first sheet only**, with `cellDates: true`. A date cell is written back
  to text as `dd/mm/yyyy` by `cellToString` in [normalize.ts](../src/lib/import/normalize.ts).
- **Tuned layouts:** the same three presets apply, since the grid is the same. The only Excel
  fixture is an `.xlsx` built in memory in `presets.test.ts` ("parses the same HDFC layout from an
  .xlsx buffer"), HDFC savings only. There is no committed `.xls` (OLE2) file and no committed
  fixture for HDFC credit card or DBS in Excel form (`git ls-files` shows no `.csv`, `.xls`,
  `.xlsx` or `.pdf` files at all).
- **DECISIONS:** "Import — CSV/Excel in the browser"; "Import — Excel parsing comes from the
  SheetJS CDN".

### PDF

- **Modules:** [pdf.ts](../src/lib/import/pdf.ts) (`pdfToGrid`, loaded with a dynamic `import()`
  from `parseFileToGrid` so pdf.js only loads when a PDF is opened) and
  [pdf-grid.ts](../src/lib/import/pdf-grid.ts) (`gridFromItems`, `clusterRows`, `clusterColumns`,
  `alignRowToAnchors`).
- **How it reads:** text spans are clustered into rows by y position (`ROW_TOLERANCE = 2.5`). The
  first row for which `rowLooksLikeHeader` is true is the header, and its x positions become column
  anchors. Only rows containing a span that `parseStatementDate` accepts, plus the header, are kept;
  each is aligned to the anchors by a monotonic cost match. If a page has no header row, anchors
  come from `clusterColumns` over the data rows instead. Pages are processed one at a time and
  appended, so a header repeated on each page lands in the grid as a data row; it fails date parsing
  in `mapRawRecord` and is counted in `skippedRowCount`.
- **Tuned layouts:** **HDFC savings only.** A code comment in `pdf-grid.ts` says `ROW_TOLERANCE` is
  "tuned against one bank's PDF (HDFC savings)" and should become per-preset if another bank
  misgroups. The only test is `gridFromItems` in [pdf.test.ts](../src/lib/import/pdf.test.ts),
  using hand-built positioned spans modelled on that layout, then `parseImportGrid` resolving to
  `hdfc_savings`. HDFC credit card and DBS have no PDF fixture.
- **Password-protected PDFs:** `pdfToGrid` throws `PdfPasswordError`; the wizard
  ([import-wizard.tsx](../src/components/import/import-wizard.tsx)) shows a password step. The
  password is passed to pdf.js in the browser only.
- **DECISIONS:** "Import — PDF statements": "Only HDFC savings has a tuned layout so far; a new
  bank needs its own fixture, not a shared guess." Also "Import — CSV/Excel in the browser" for the
  browser-only rule that PDF inherits.

## What a staged row carries

`parseImportGrid` produces `MappedImportRow`s ([types.ts](../src/lib/import/types.ts)).
`attachHashesToRows` and `toStageDrafts` then turn them into the drafts sent to staging. The table
traces each field named in the ticket to the function that sets it.

| Field | Set by | Notes |
| --- | --- | --- |
| `occurred_at` | `buildMappedRows` in `parse.ts`, calling `midnightIst` in `normalize.ts` | The date itself comes from `mapRawRecord` in `map.ts` via `parseStatementDate`. Always midnight `+05:30`. A statement time-of-day is never read. DECISIONS "Import — everything is IST". |
| `payee` | `applyHeuristics` in [heuristics.ts](../src/lib/import/heuristics.ts), using `extractMerchant` | Recognises UPI handle, `UPI-`, `NEFT`, `IMPS`, and `POS` shapes. Falls back to the keyword category name, or the first 48 characters of the narration. Called from `buildMappedRows`. |
| `narration` | `mapRawRecord` in `map.ts` (the trimmed description cell), echoed by `applyHeuristics` | A row with an empty description is dropped (`mapRawRecord` returns `null`). Stored in full, per DECISIONS "Full narration is stored". |
| `note` | `extractNote` in `heuristics.ts`, via `applyHeuristics` | Last `-`-separated segment, only when the narration has at least 5 segments and the tail does not look like a reference number, VPA, IFSC, or masked account. |
| `note_key` | `normalizeNoteKey` in `heuristics.ts`, via `applyHeuristics` | Note upper-cased with month names and numbers removed. **Not in the staged draft:** `toStageDrafts` in [stage.ts](../src/lib/import/stage.ts) does not carry it. `teach.ts` recomputes it from `note` when staged rows are read back. |
| `descriptor` | `buildMappedRows` in `parse.ts` | Set to the raw trimmed narration. Equal to `narration` at parse time. This is the string `attachHashesToRows` hashes. |
| `balance_paise` | `mapRawRecord` in `map.ts` via `parseAmountToPaise`, only if a balance column is mapped | `null` when no balance column is mapped or the cell is empty. **Not in the staged draft.** Its only reader is `inferOpeningBalance` in `stage.ts`, used by the wizard when it creates an account. |
| `confidence` | `applyHeuristics` in `heuristics.ts`: keyword hit uses the rule's confidence (a note hit adds 0.06, capped at 0.95), 0.4 for a payee with no keyword, 0.2 otherwise | `toStageDrafts` raises it to at least 0.9 when an import rule matched. Keyword table is `KEYWORD_RULES` in `keywords.ts`. |
| `suggested_category_id` | `toStageDrafts` in `stage.ts` | First `applyImportRules`, else `categoryIdByName` on the heuristic's `suggested_category_name`. `null` if neither resolves. |
| `import_hash` | `attachHashesToRows` / `computeImportHashes` in [hash.ts](../src/lib/import/hash.ts) | Empty string from `parse.ts`; filled once the destination account is known. `toStageDrafts` drops any row without a hash. Formula: DECISIONS "Import — hash dedupe". |

Two more things read from the same path:

- `amount_paise` is signed in `MappedImportRow` and written as an absolute value plus `type` by
  `toStageDrafts`. `raw_line` is staged as `{}`.
- Rows that fail date, description, or amount parsing are skipped and counted in
  `skippedRowCount` (`parseImportGrid`), per DECISIONS "Import — amount and date parsing".

### Which narration fields are read

The pipeline reads **one** text column per row: the column named by `mapping.descriptionColumn`.
Aliases that can supply it are in the presets table above plus the generic `DESCRIPTION_ALIASES`:
`narration`, `description`, `transaction description`, `particulars`, `remarks`,
`transaction remarks`, `details`, `statement`, `transaction details`, `merchant`, `transaction`.

Nothing combines two text columns. A reference or cheque number column (HDFC's `Chq/Ref Number`
in the test fixture) is not read. Parsing of the narration string is tuned to the Indian
payment-rail shapes named in `heuristics.ts` (UPI, NEFT, IMPS, POS, and the rail prefixes in
`RAIL_PREFIX`).

## What we cannot read today

1. **Banks without a preset.** Anything other than HDFC savings, HDFC credit card, and DBS goes
   through `guessMapping`, which only recognises the generic aliases listed in `presets.ts`. A
   header the lists do not contain leaves the column unmapped and `validateMapping` reports an
   error until the user maps it by hand. DECISIONS "Import — bank presets" names this as the
   intended fallback; it means no other bank's date format, sign convention, or header text is
   known in advance. `BANK_NEEDLES` in `match-accounts.ts` lists more bank names (`icici`, `axis`,
   `sbi`, `indusind`, `idfc`, `kotak`, `yes bank`, `iob`) but that only suggests an account, not a
   layout.
2. **Scanned or no-text-layer PDFs.** `pdfToGrid` throws `PdfNoTextLayerError` when no page has
   any text span, with the message "OCR isn't supported". DECISIONS "Import — PDF statements": "no
   OCR". A PDF with a text layer but a layout that `gridFromItems` misreads is not detected as an
   error; it produces wrong or fewer rows.
3. **PDFs from any bank except HDFC savings.** Per the DECISIONS entry and the code comment above,
   no other layout is tuned or fixtured. A PDF row only survives if one of its spans is, on its
   own, a date `parseStatementDate` accepts, so a date that shares a span with other text, or a
   second wrapped line of a narration with no date of its own, is not kept as part of a row.
4. **One custom mapping per account.** DECISIONS "Import — one custom mapping per account":
   `import_profiles` is unique on `(user_id, account_id, bank_preset)` and every unrecognised bank
   is saved as `custom`, so a second custom-mapped bank on the same account overwrites the first
   one's saved mapping. "Known limitation, accepted." The unique index is
   `ux_import_profile_account_preset` in `supabase/migrations/20260814080138_csv_import_center.sql`;
   the save path is `ensureImportSourceAndProfile` in
   [mutations.functions.ts](../src/lib/mutations.functions.ts), which looks the profile up by
   those same three fields.
5. **Other worksheets.** `gridFromWorkbook` reads the first sheet only.
6. **A second text column per row.** See "Which narration fields are read".
7. **Anything that is not a statement.** A file with fewer than 3 columns is rejected at the file
   step of the wizard (DECISIONS "Import — a file that is not a statement is rejected at the door").

## Questions for PR

The code settles what is read. It does not say which real files exist. These are unverified, and
none of the answers is assumed above.

1. Which exact HDFC savings exports have been tried, and in which formats (NetBanking CSV, `.xls`,
   PDF)? The preset aliases and PDF tuning exist, but the repo holds no real sample.
2. Does the HDFC credit card statement ever come with separate debit and credit columns instead of
   one amount column? If yes, the current `hdfc_cc` preset cannot detect it. Which format is it
   actually downloaded in: CSV, Excel, or PDF only?
3. Is the DBS preset based on a real DBS India export? `dbs` uses `auto` dates, `statement` and
   `particulars` as description aliases, and `account balance`. Which format, and does a PDF exist
   for it?
4. Which other banks and cards does PR hold accounts with (ICICI, Axis, SBI, Kotak, IndusInd, IDFC,
   Yes Bank, IOB appear in `BANK_NEEDLES`, but only as account hints)? For each, which file type
   can be exported, and which of them offer CSV or Excel rather than PDF only?
5. Do real PDF statements wrap long narrations onto a second line, or put the date and narration in
   one text span? Both would lose text under the row-keeping rule in `gridFromItems`.
6. Are real `.xls` exports (the older OLE2 format) in use? No `.xls` file is tested.
7. Does any bank put the statement across more than one worksheet, so that reading only the first
   sheet would drop rows?
8. Is a reference or cheque number column ever needed for matching or categorisation? Today it is
   not read.
9. Excel dates are turned into `dd/mm/yyyy` text using the browser's local date parts
   (`cellToString`). Is every real import run from a browser in IST, or should this be checked for
   a browser in another time zone before PRD #6 relies on Excel?
10. Do saved profiles for non-CSV files matter for reporting? `ensureImportSourceAndProfile` creates the import
    source with `kind: "csv"` regardless of whether the file was Excel or PDF, so this audit cannot
    tell Excel and PDF imports from CSV ones in stored data.
