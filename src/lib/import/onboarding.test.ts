import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Category, ImportJobRow } from "@/data/schema";
import { parseImportText } from "./parse";
import { inferOpeningBalance } from "./stage";
import { buildTeachGroups } from "./teach";

function stagedRow(
  id: string,
  occurredAt: string,
  payee: string,
  note: string | null,
): ImportJobRow {
  return {
    id,
    job_id: "job-1",
    account_id: "account-1",
    occurred_at: `${occurredAt}T00:00:00+05:30`,
    payee,
    descriptor: `UPI-${payee}`,
    narration: `UPI-${payee}${note ? `-${note}` : ""}`,
    note,
    amount_paise: 25_000,
    type: "expense",
    raw_line: {},
    import_hash: id,
    status: "pending",
    suggested_category_id: null,
    transaction_id: null,
    confidence: null,
    possible_duplicate: null,
  };
}

describe("onboarding statement balances", () => {
  it("maps running balances and infers the opening bank balance", async () => {
    const parsed = await parseImportText(
      "Date,Narration,Debit,Credit,Closing Balance\n01/05/2026,UPI-SWIGGY,500,,9500\n02/05/2026,SALARY,,1000,10500",
      { filename: "statement.csv" },
    );

    assert.equal(parsed.rows[0]?.balance_paise, 950_000);
    assert.equal(inferOpeningBalance(parsed.rows, "bank"), 1_000_000);
  });

  it("converts card liabilities to a negative opening balance", async () => {
    const parsed = await parseImportText(
      "Date,Narration,Debit,Credit,Closing Balance\n01/05/2026,POS-CAFE,500,,500",
      { filename: "statement.csv", preset: "hdfc_cc" },
    );

    assert.equal(inferOpeningBalance(parsed.rows, "credit_card"), 0);
  });

  it("uses zero when no usable running balance is present", async () => {
    const parsed = await parseImportText(
      "Date,Narration,Debit,Credit\n01/05/2026,UPI-SWIGGY,500,",
      { filename: "statement.csv" },
    );

    assert.equal(inferOpeningBalance(parsed.rows, "bank"), 0);
  });

  it("rebuilds note-first groups from staged rows after a reload", () => {
    const categories: Category[] = [];
    const groups = buildTeachGroups(
      [
        stagedRow("row-1", "2026-01-01", "Merchant A", "FAGS"),
        stagedRow("row-2", "2026-01-30", "Merchant B", "FAGS"),
        stagedRow("row-3", "2026-02-01", "Merchant C", null),
        stagedRow("row-4", "2026-02-02", "Merchant C", null),
      ],
      categories,
    );

    assert.equal(groups.length, 2);
    assert.equal(groups.find((group) => group.key === "FAGS")?.rowCount, 2);
    assert.equal(groups.find((group) => group.key === "MERCHANT C")?.rowCount, 2);
  });
});
