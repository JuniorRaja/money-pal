import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Category } from "@/data/schema";
import type { MappedImportRow } from "./types";
import {
  groupRowsForReview,
  magnitudeBucket,
  matchFieldForGroup,
  rankCategoriesForGroup,
  summariseProgress,
  type GroupableImportRow,
} from "./group.ts";

function row(index: number, options: Partial<GroupableImportRow> = {}): GroupableImportRow {
  const date = `2026-01-${String(index + 1).padStart(2, "0")}`;
  return {
    id: `row-${index}`,
    occurrence_index: index,
    occurred_on: date as MappedImportRow["occurred_on"],
    type: "expense",
    payee: `Payee ${index}`,
    note: null,
    note_key: null,
    matched_on: null,
    amount_paise: 50_000 as MappedImportRow["amount_paise"],
    suggested_category_name: null,
    confidence: 0.2,
    ...options,
  };
}

const categories = [
  ["Salary", "income"],
  ["Freelance", "income"],
  ["Interest", "income"],
  ["Transfer", "transfer"],
  ["EMI", "essentials"],
  ["Insurance", "essentials"],
  ["Investments", "investment"],
  ["Utilities", "essentials"],
  ["Rent", "essentials"],
  ["Transport", "essentials"],
  ["Groceries", "essentials"],
  ["Dining", "lifestyle"],
  ["Shopping", "lifestyle"],
].map(([name, group], index) => ({
  id: String(index),
  name: name!,
  group: group as Category["group"],
  icon: "",
  color_token: "",
}));

describe("import review groups", () => {
  it("groups different payees by the same normalized note", () => {
    const groups = groupRowsForReview([
      row(0, { note: "FAGS", note_key: "FAGS", payee: "Apurvasigamani" }),
      row(1, { note: "FAGS", note_key: "FAGS", payee: "J Amaliya Cool Bar" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.keyKind, "note");
    assert.equal(groups[0]?.rowCount, 2);
  });

  it("normalizes month-varying rent notes and groups by matched category next", () => {
    const rent = groupRowsForReview([
      row(0, { note: "RENT MAY" }),
      row(1, { note: "RENT JUN" }),
      row(2, { note: "RENT JUL" }),
    ]);
    assert.equal(rent.length, 1);
    assert.equal(rent[0]?.rowCount, 3);

    const dining = groupRowsForReview([
      row(3, { payee: "Swiggy", suggested_category_name: "Dining", matched_on: "narration" }),
      row(4, { payee: "Zomato", suggested_category_name: "Dining", matched_on: "narration" }),
      row(5, { payee: "EatSure", suggested_category_name: "Dining", matched_on: "narration" }),
    ]);
    assert.equal(dining.length, 1);
    assert.equal(dining[0]?.keyKind, "keyword");
    assert.equal(dining[0]?.rowCount, 3);
  });

  it("falls back to payee and gives an explicit note higher priority than category", () => {
    const payeeGroups = groupRowsForReview([
      row(0, { payee: "Apurvasigamani" }),
      row(1, { payee: "Apurvasigamani" }),
    ]);
    assert.equal(payeeGroups.length, 1);
    assert.equal(payeeGroups[0]?.keyKind, "payee");
    const noteGroup = groupRowsForReview([
      row(2, { note: "LUNCH", suggested_category_name: "Dining", matched_on: "narration" }),
    ])[0];
    assert.equal(noteGroup?.key, "LUNCH");
    assert.equal(matchFieldForGroup(noteGroup!), "note");
    assert.equal(matchFieldForGroup(payeeGroups[0]!), "payee");
    const keywordGroup = groupRowsForReview([
      row(3, { payee: "Swiggy", suggested_category_name: "Dining", matched_on: "narration" }),
    ])[0];
    assert.equal(matchFieldForGroup(keywordGroup!), "narration");
  });

  it("assigns settled, needs-input, and trivial bands and sorts by value", () => {
    const groups = groupRowsForReview([
      row(0, {
        id: "settled",
        suggested_category_name: "Dining",
        matched_on: "narration",
        confidence: 0.86,
      }),
      row(1, { id: "trivial", amount_paise: 12_000 as MappedImportRow["amount_paise"] }),
      row(2, { id: "small", amount_paise: 432_000 as MappedImportRow["amount_paise"] }),
      row(3, { id: "large", amount_paise: 6_600_000 as MappedImportRow["amount_paise"] }),
    ]);
    assert.equal(groups.find((group) => group.rowIds[0] === "settled")?.band, "settled");
    assert.equal(groups.find((group) => group.rowIds[0] === "trivial")?.band, "trivial");
    assert.equal(groups.find((group) => group.rowIds[0] === "small")?.band, "needs_input");
    assert.equal(groups[1]?.rowIds[0], "large");
  });

  it("keeps a 100-row statement to at most 35 groups with 70% of value in the top six", () => {
    const groups = groupRowsForReview(
      Array.from({ length: 100 }, (_, index) =>
        row(index, {
          payee: `Payee ${index % 20}`,
          amount_paise: (index % 20 < 6 ? 110_000 : 15_000) as MappedImportRow["amount_paise"],
        }),
      ),
    );
    assert.ok(groups.length <= 35);
    const totalPaise = groups.reduce((sum, group) => sum + group.totalPaise, 0);
    const topSixPaise = groups.slice(0, 6).reduce((sum, group) => sum + group.totalPaise, 0);
    assert.ok(topSixPaise / totalPaise >= 0.7);
  });

  it("narrows category chips by direction and recurrence shape", () => {
    const income = rankCategoriesForGroup({ type: "income", recurrence: null }, categories);
    assert.ok(
      income.every((category) => category.group === "income" || category.group === "transfer"),
    );

    const exact = rankCategoriesForGroup(
      {
        type: "expense",
        recurrence: {
          key: "RENT",
          keyKind: "note",
          type: "expense",
          occurrenceIndexes: [1, 2],
          cadence: "monthly",
          amountStability: "exact",
          humanRound: false,
          magnitude: "medium",
        },
      },
      categories,
    );
    assert.ok(exact.some((category) => category.name === "EMI"));
    assert.ok(exact.some((category) => category.name === "Insurance"));
    assert.ok(!exact.some((category) => category.name === "Dining"));

    const variable = rankCategoriesForGroup(
      {
        type: "expense",
        recurrence: {
          key: "UTILITIES",
          keyKind: "payee",
          type: "expense",
          occurrenceIndexes: [1, 2],
          cadence: "monthly",
          amountStability: "variable",
          humanRound: false,
          magnitude: "medium",
        },
      },
      categories,
    );
    assert.ok(variable.some((category) => category.name === "Utilities"));
    assert.ok(!variable.some((category) => category.name === "EMI"));
  });

  it("promotes similar-value monthly groups and summarizes rupee progress", () => {
    const rows = [
      row(0, {
        id: "one-off",
        payee: "One-off",
        amount_paise: 100_000 as MappedImportRow["amount_paise"],
      }),
      row(1, {
        id: "monthly-a",
        payee: "Subscription",
        amount_paise: 95_000 as MappedImportRow["amount_paise"],
      }),
      row(2, {
        id: "monthly-b",
        payee: "Subscription",
        amount_paise: 95_000 as MappedImportRow["amount_paise"],
      }),
    ];
    const shapes = [
      {
        key: "SUBSCRIPTION",
        keyKind: "payee" as const,
        type: "expense" as const,
        occurrenceIndexes: [1, 2],
        cadence: "monthly" as const,
        amountStability: "exact" as const,
        humanRound: false,
        magnitude: "medium" as const,
      },
    ];
    const groups = groupRowsForReview(rows, { recurrenceShapes: shapes });
    assert.equal(groups[0]?.rowIds[0], "monthly-a");
    const progress = summariseProgress([
      { band: "settled", totalPaise: 100_000 },
      { band: "needs_input", totalPaise: 30_000 },
    ]);
    assert.deepEqual(progress, { settledPaise: 100_000, totalPaise: 130_000, pct: 77 });
    assert.equal(
      magnitudeBucket(300, [{ totalPaise: 100 }, { totalPaise: 200 }, { totalPaise: 300 }]),
      "large",
    );
  });

  it("counts clearing the high-value group as more progress than clearing five small groups", () => {
    const groups = [
      { band: "needs_input" as const, totalPaise: 100_000 },
      ...Array.from({ length: 5 }, () => ({ band: "needs_input" as const, totalPaise: 10_000 })),
    ];
    const topGroupProgress = summariseProgress([
      { ...groups[0]!, band: "settled" },
      ...groups.slice(1),
    ]);
    const fiveSmallProgress = summariseProgress([
      groups[0]!,
      ...groups.slice(1).map((group) => ({ ...group, band: "settled" as const })),
    ]);
    assert.ok(topGroupProgress.pct > fiveSmallProgress.pct);
  });
});
