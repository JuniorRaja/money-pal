import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gridFromItems } from "./pdf-grid.ts";
import { parseImportGrid } from "./parse.ts";

// x/y positions lifted from a real HDFC savings PDF layout: 5 columns, one
// text run per cell except narration (split across two runs, as pdf.js often
// emits for a long string), all within row-clustering tolerance of each other.
const COLS = { date: 40, narration: 100, debit: 300, credit: 360, balance: 420 };
const HEADER_Y = 700;
const ROW1_Y = 680;
const ROW2_Y = 660;

type Item = { str: string; x: number; y: number };

function headerRow(): Item[] {
  return [
    { str: "Date", x: COLS.date, y: HEADER_Y },
    { str: "Narration", x: COLS.narration, y: HEADER_Y },
    { str: "Debit Amount", x: COLS.debit, y: HEADER_Y },
    { str: "Credit Amount", x: COLS.credit, y: HEADER_Y },
    { str: "Closing Balance", x: COLS.balance, y: HEADER_Y },
  ];
}

const items: Item[] = [
  ...headerRow(),
  { str: "01/08/2026", x: COLS.date, y: ROW1_Y },
  // 1.5pt off the row's baseline — a different font run on the same visual
  // line (common for pdf.js output) — must still cluster into this row.
  { str: "UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT", x: COLS.narration, y: ROW1_Y + 1.5 },
  { str: "450.00", x: COLS.debit, y: ROW1_Y },
  { str: "0.00", x: COLS.credit, y: ROW1_Y },
  { str: "49550.00", x: COLS.balance, y: ROW1_Y },
  { str: "02/08/2026", x: COLS.date, y: ROW2_Y },
  { str: "NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG", x: COLS.narration, y: ROW2_Y },
  { str: "0.00", x: COLS.debit, y: ROW2_Y },
  { str: "120000.00", x: COLS.credit, y: ROW2_Y },
  { str: "169550.00", x: COLS.balance, y: ROW2_Y },
];

describe("gridFromItems", () => {
  it("clusters positioned text spans into rows and columns", () => {
    const grid = gridFromItems(items);
    assert.deepEqual(grid, [
      ["Date", "Narration", "Debit Amount", "Credit Amount", "Closing Balance"],
      [
        "01/08/2026",
        "UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT",
        "450.00",
        "0.00",
        "49550.00",
      ],
      [
        "02/08/2026",
        "NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG",
        "0.00",
        "120000.00",
        "169550.00",
      ],
    ]);
  });

  it("returns an empty grid for no items", () => {
    assert.deepEqual(gridFromItems([]), []);
  });

  it("feeds the existing HDFC preset and amount/date parsing unchanged", () => {
    const grid = gridFromItems(items);
    const result = parseImportGrid(grid, { filename: "hdfc-statement.pdf" });
    assert.equal(result.detectedPreset, "hdfc_savings");
    assert.equal(result.mappingErrors.length, 0);
    assert.equal(result.rows.length, 2);

    const [swiggy, salary] = result.rows;
    assert.equal(swiggy?.occurred_on, "2026-08-01");
    assert.equal(swiggy?.amount_paise, -45000);
    assert.equal(swiggy?.type, "expense");

    assert.equal(salary?.occurred_on, "2026-08-02");
    assert.equal(salary?.amount_paise, 12000000);
    assert.equal(salary?.type, "income");
  });
});
