import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKey } from "../money.ts";
import { parseAmountToPaise, parseStatementDate } from "./normalize.ts";

describe("statement amount parsing", () => {
  it("handles currency-prefixed rupees", () => {
    // Regression: a [₹rs\s] character class ate the letters out of "Rs.100",
    // leaving ".100" — 10 paise instead of 10000, with no error surfaced.
    assert.equal(parseAmountToPaise("Rs.100"), 10000);
    assert.equal(parseAmountToPaise("Rs. 1,234.50"), 123450);
    assert.equal(parseAmountToPaise("INR 500"), 50000);
    assert.equal(parseAmountToPaise("₹1,200.00"), 120000);
    assert.equal(parseAmountToPaise("1,234.50 INR"), 123450);
  });

  it("reads direction from parentheses and Dr/Cr suffixes", () => {
    assert.equal(parseAmountToPaise("(500.25)"), -50025);
    assert.equal(parseAmountToPaise("500.25 Dr"), -50025);
    assert.equal(parseAmountToPaise("1,234.50 Cr"), 123450);
    assert.equal(parseAmountToPaise("-450.00"), -45000);
  });

  it("treats blanks as zero and gibberish as unparseable", () => {
    assert.equal(parseAmountToPaise(""), 0);
    assert.equal(parseAmountToPaise("-"), 0);
    assert.equal(parseAmountToPaise("abc"), null);
  });
});

describe("statement date parsing", () => {
  it("defaults ambiguous numeric dates to DMY for Indian statements", () => {
    assert.equal(parseStatementDate("01/02/2026"), "2026-02-01");
  });

  it("infers MDY when the first component cannot be a day", () => {
    assert.equal(parseStatementDate("05/13/2026"), "2026-05-13");
  });

  it("rejects impossible calendar dates", () => {
    assert.equal(parseStatementDate("31/02/2026"), null);
  });
});

describe("dayKey", () => {
  it("resolves an instant to its IST calendar day", () => {
    // Regression: staging writes midnight IST, which Postgres returns as
    // 18:30 UTC the day before. Slicing the raw string lost a day, and the
    // review deck posted that shifted date straight back to the ledger.
    assert.equal(dayKey("2026-08-14T18:30:00+00:00"), "2026-08-15");
    assert.equal(dayKey("2026-08-15T00:00:00+05:30"), "2026-08-15");
    assert.equal(dayKey("2026-07-31T18:30:00+00:00"), "2026-08-01");
  });
});
