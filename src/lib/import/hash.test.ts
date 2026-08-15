import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeImportHashes, hashImportRow, importHashPayload } from "./hash.ts";
import { normalizeNarration } from "./normalize.ts";

const ACCOUNT = "acct-hdfc-001";

describe("import hash occurrence index", () => {
  it("builds sha256(account_id|date|signed_amount|normalized_narration|n)", () => {
    const payload = importHashPayload({
      accountId: ACCOUNT,
      date: "2026-08-01",
      signedAmountPaise: -45000,
      narration: "  upi-swiggy-payment  ",
      occurrenceIndex: 0,
    });
    assert.equal(
      payload,
      `${ACCOUNT}|2026-08-01|-45000|${normalizeNarration("  upi-swiggy-payment  ")}|0`,
    );
  });

  it("gives n=0 and n=1 to two same-day same-amount same-narration rows", async () => {
    const twin = { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-SWIGGY-PAYMENT" };
    const hashes = await computeImportHashes(ACCOUNT, [twin, twin]);
    assert.equal(hashes[0]?.occurrence_index, 0);
    assert.equal(hashes[1]?.occurrence_index, 1);
    assert.notEqual(hashes[0]?.import_hash, hashes[1]?.import_hash);
    assert.equal(hashes[0]?.import_hash.length, 64);
  });

  it("is stable when the same file order is hashed twice", async () => {
    const rows = [
      { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-SWIGGY-PAYMENT" },
      { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-SWIGGY-PAYMENT" },
      { date: "2026-08-02", signedAmountPaise: 12000000, narration: "NEFT CR SALARY" },
    ];
    const a = await computeImportHashes(ACCOUNT, rows);
    const b = await computeImportHashes(ACCOUNT, rows);
    assert.deepEqual(
      a.map((x) => x.import_hash),
      b.map((x) => x.import_hash),
    );
  });

  it("does not collide when narration differs", async () => {
    const hashes = await computeImportHashes(ACCOUNT, [
      { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-SWIGGY" },
      { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-ZOMATO" },
    ]);
    assert.equal(hashes[0]?.occurrence_index, 0);
    assert.equal(hashes[1]?.occurrence_index, 0);
    assert.notEqual(hashes[0]?.import_hash, hashes[1]?.import_hash);
  });

  it("matches hashImportRow for a given n", async () => {
    const direct = await hashImportRow({
      accountId: ACCOUNT,
      date: "2026-08-01",
      signedAmountPaise: -45000,
      narration: "UPI-SWIGGY-PAYMENT",
      occurrenceIndex: 1,
    });
    const [first, second] = await computeImportHashes(ACCOUNT, [
      { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-SWIGGY-PAYMENT" },
      { date: "2026-08-01", signedAmountPaise: -45000, narration: "UPI-SWIGGY-PAYMENT" },
    ]);
    assert.equal(second?.import_hash, direct);
    assert.notEqual(first?.import_hash, direct);
  });
});
