import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseImportBuffer } from "./parse.ts";

// Synthetic fixtures from scripts/make-import-fixtures.ts. This guards that they still
// look like the real exports: if HDFC stops parsing, the fixture (or the reader) drifted.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

describe("synthetic statement fixtures", () => {
  it("HDFC savings .xls fixture parses (via header guessing, like the real export)", async () => {
    const result = await parseImportBuffer(fixture("hdfc-savings-jun-2026.xls"), {
      filename: "hdfc-savings-jun-2026.xls",
    });
    // Real NetBanking .xls headers ("Withdrawal Amt.") don't match the hdfc_savings preset yet,
    // so detection returns null and guessMapping does the work. Flip to "hdfc_savings" when fixed.
    assert.equal(result.detectedPreset, null);
    assert.equal(result.rows.length, 10);
    assert.equal(result.rows[1]?.amount_paise, -50000); // ₹500 to a person: the "why?" case
    assert.equal(result.rows[7]?.amount_paise, 8500000); // salary credit
  });
});
