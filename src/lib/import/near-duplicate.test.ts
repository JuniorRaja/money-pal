import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchNearDuplicates, signedAmountPaise } from "./near-duplicate.ts";

const ACCOUNT = "acct-hdfc-001";
const OTHER = "acct-icici-002";

/** Midnight IST for a calendar day, the way `fn_record_transaction` stores it. */
function ist(day: string): string {
  return `${day}T18:30:00+00:00`;
}

function staged(over: Partial<Parameters<typeof matchNearDuplicates>[0][number]> = {}) {
  return {
    id: "row-1",
    account_id: ACCOUNT,
    occurred_at: ist("2026-08-11"),
    amount_paise: 129900,
    type: "expense" as const,
    ...over,
  };
}

function committed(over: Partial<Parameters<typeof matchNearDuplicates>[1][number]> = {}) {
  return {
    id: "txn-1",
    account_id: ACCOUNT,
    occurred_at: ist("2026-08-11"),
    amount: -129900,
    merchant: "Swiggy",
    ...over,
  };
}

describe("near-duplicate matching", () => {
  it("signs a staged row the way a ledger entry is signed", () => {
    assert.equal(signedAmountPaise({ amount_paise: 129900, type: "expense" }), -129900);
    assert.equal(signedAmountPaise({ amount_paise: 129900, type: "income" }), 129900);
  });

  it("matches the same day regardless of how the narration was written", () => {
    const matches = matchNearDuplicates([staged()], [committed()]);
    assert.equal(matches.get("row-1")?.id, "txn-1");
    assert.equal(matches.get("row-1")?.amount_paise, 129900);
    assert.equal(matches.get("row-1")?.merchant, "Swiggy");
  });

  it("matches one day either side but not two", () => {
    const within = ["2026-08-10", "2026-08-11", "2026-08-12"];
    for (const day of within) {
      const matches = matchNearDuplicates([staged()], [committed({ occurred_at: ist(day) })]);
      assert.equal(matches.size, 1, `expected a match for ${day}`);
    }
    for (const day of ["2026-08-09", "2026-08-13"]) {
      const matches = matchNearDuplicates([staged()], [committed({ occurred_at: ist(day) })]);
      assert.equal(matches.size, 0, `expected no match for ${day}`);
    }
  });

  it("does not cross accounts, amounts, or direction", () => {
    assert.equal(matchNearDuplicates([staged()], [committed({ account_id: OTHER })]).size, 0);
    assert.equal(matchNearDuplicates([staged()], [committed({ amount: -129800 })]).size, 0);
    // Same magnitude, opposite direction — a refund is not the charge.
    assert.equal(matchNearDuplicates([staged()], [committed({ amount: 129900 })]).size, 0);
  });

  it("prefers the closest day when several candidates qualify", () => {
    const matches = matchNearDuplicates(
      [staged()],
      [
        committed({ id: "txn-far", occurred_at: ist("2026-08-12") }),
        committed({ id: "txn-near", occurred_at: ist("2026-08-11") }),
      ],
    );
    assert.equal(matches.get("row-1")?.id, "txn-near");
  });

  it("flags both of two genuine same-day charges rather than skipping either", () => {
    // The matcher only ever reports; nothing here drops a row. Two real ₹1,299
    // Swiggy orders on one day look exactly like a duplicate, so a human decides.
    const rows = [staged({ id: "row-1" }), staged({ id: "row-2" })];
    const matches = matchNearDuplicates(rows, [committed()]);
    assert.deepEqual([...matches.keys()], ["row-1", "row-2"]);
    assert.equal(rows.length, 2);
  });

  it("returns nothing when the ledger is empty", () => {
    assert.equal(matchNearDuplicates([staged()], []).size, 0);
  });
});
