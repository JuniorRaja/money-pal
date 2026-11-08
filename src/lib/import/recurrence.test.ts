import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MappedImportRow } from "./types";
import { detectRecurring, propagateRecurringCategories } from "./recurrence.ts";

function row(
  occurrence_index: number,
  occurred_on: string,
  amount_paise: number,
  options: Partial<MappedImportRow> = {},
): MappedImportRow {
  return {
    occurrence_index,
    occurred_on: occurred_on as MappedImportRow["occurred_on"],
    occurred_at: `${occurred_on}T00:00:00+05:30` as MappedImportRow["occurred_at"],
    payee: "Landlord",
    narration: "IMPS-RENT",
    descriptor: "IMPS-RENT",
    note: "RENT",
    note_key: "RENT",
    amount_paise: -amount_paise as MappedImportRow["amount_paise"],
    type: "expense",
    import_hash: "",
    suggested_category_name: null,
    matched_on: null,
    confidence: 0.2,
    ...options,
  };
}

describe("recurrence shapes", () => {
  it("detects near, human-round monthly expenses without assigning a category", () => {
    const rows = [
      row(0, "2026-01-01", 2_200_000),
      row(1, "2026-01-31", 2_200_500),
      row(2, "2026-03-02", 2_199_000),
    ];
    const [shape] = detectRecurring(rows);
    assert.equal(shape?.cadence, "monthly");
    assert.equal(shape?.amountStability, "near");
    assert.equal(shape?.humanRound, true);
    assert.equal("category" in (shape ?? {}), false);
  });

  it("detects exact roundness and variable monthly amounts", () => {
    const exact = detectRecurring([
      row(0, "2026-01-01", 431_700),
      row(1, "2026-01-31", 431_700),
      row(2, "2026-03-02", 431_700),
    ])[0];
    const variable = detectRecurring([
      row(3, "2026-01-01", 120_000, { note_key: "ELECTRICITY" }),
      row(4, "2026-01-31", 240_000, { note_key: "ELECTRICITY" }),
      row(5, "2026-03-02", 180_000, { note_key: "ELECTRICITY" }),
    ])[0];
    assert.equal(exact?.amountStability, "exact");
    assert.equal(exact?.cadence, "monthly");
    assert.equal(exact?.humanRound, false);
    assert.equal(variable?.cadence, "monthly");
    assert.equal(variable?.amountStability, "variable");
  });

  it("ignores single occurrences and labels non-monthly spacing irregular", () => {
    assert.deepEqual(detectRecurring([row(0, "2026-01-01", 10_000)]), []);
    const [shape] = detectRecurring([
      row(0, "2026-01-01", 10_000),
      row(1, "2026-01-06", 10_000),
      row(2, "2026-02-25", 10_000),
    ]);
    assert.equal(shape?.cadence, "irregular");
  });

  it("groups by note before payee and keeps income separate", () => {
    const rows = [
      row(0, "2026-01-01", 10_000, { note_key: "RENT", payee: "Person A" }),
      row(1, "2026-01-31", 10_000, { note_key: "RENT", payee: "Person B" }),
      row(2, "2026-03-02", 10_000, { note_key: "RENT", payee: "Person C" }),
    ];
    assert.equal(detectRecurring(rows).length, 1);
    assert.equal(detectRecurring(rows)[0]?.keyKind, "note");
  });

  it("never infers Rent or Salary from recurring amount or relative size", () => {
    const rows = [
      row(0, "2026-01-01", 6_600_000, { note_key: "UNKNOWN EXPENSE", payee: "Unknown expense" }),
      row(1, "2026-01-31", 6_600_000, { note_key: "UNKNOWN EXPENSE", payee: "Unknown expense" }),
      row(2, "2026-03-02", 6_600_000, { note_key: "UNKNOWN EXPENSE", payee: "Unknown expense" }),
      row(3, "2026-01-01", 6_600_000, {
        note_key: "UNKNOWN CREDIT",
        payee: "Unknown credit",
        type: "income",
        amount_paise: 6_600_000 as MappedImportRow["amount_paise"],
      }),
      row(4, "2026-01-31", 6_600_000, {
        note_key: "UNKNOWN CREDIT",
        payee: "Unknown credit",
        type: "income",
        amount_paise: 6_600_000 as MappedImportRow["amount_paise"],
      }),
      row(5, "2026-03-02", 6_600_000, {
        note_key: "UNKNOWN CREDIT",
        payee: "Unknown credit",
        type: "income",
        amount_paise: 6_600_000 as MappedImportRow["amount_paise"],
      }),
    ];
    const shapes = detectRecurring(rows);
    const resolved = propagateRecurringCategories(rows, shapes);
    assert.equal(shapes.length, 2);
    assert.ok(resolved.every((item) => item.suggested_category_name === null));
  });

  it("propagates a real heuristic or approved category without overwriting existing choices", () => {
    const rows = [
      row(0, "2026-01-01", 2_200_000, {
        suggested_category_name: "Rent",
        matched_on: "note",
        confidence: 0.95,
      }),
      row(1, "2026-01-31", 2_200_000),
      row(2, "2026-03-02", 2_200_000, { suggested_category_name: "Housing", confidence: 1 }),
    ];
    const shape = detectRecurring(rows);
    const propagated = propagateRecurringCategories(rows, shape);
    assert.equal(propagated[1]?.suggested_category_name, "Rent");
    assert.equal(propagated[2]?.suggested_category_name, "Housing");

    const unresolved = rows.map((item) => ({
      ...item,
      suggested_category_name: null,
      matched_on: null,
    }));
    assert.ok(
      propagateRecurringCategories(unresolved, shape).every(
        (item) => !item.suggested_category_name,
      ),
    );
    const approved = propagateRecurringCategories(unresolved, shape, new Map([[1, "Utilities"]]));
    assert.ok(approved.every((item) => item.suggested_category_name === "Utilities"));
  });
});
