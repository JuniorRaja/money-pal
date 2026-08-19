import { test } from "node:test";
import assert from "node:assert/strict";
import { caretForDigits, formatAmountInput, unformatAmount } from "./money";

test("formatAmountInput groups en-IN and keeps decimals", () => {
  assert.equal(formatAmountInput("1250"), "1,250");
  assert.equal(formatAmountInput("125000"), "1,25,000");
  assert.equal(formatAmountInput("1250.5"), "1,250.5");
  assert.equal(formatAmountInput("1250.567"), "1,250.56");
  assert.equal(formatAmountInput("1,25,000"), "1,25,000");
  assert.equal(formatAmountInput(""), "");
  assert.equal(formatAmountInput("."), ".");
  assert.equal(formatAmountInput("abc"), "");
  assert.equal(formatAmountInput("007"), "7");
  assert.equal(formatAmountInput("12.3.4"), "12.34");
});

test("formatting never changes the amount that reaches paise()", () => {
  for (const raw of ["1250", "1250.75", "125000.05", "0.5", "99999999"]) {
    assert.equal(Number(unformatAmount(formatAmountInput(raw))), Number(raw));
  }
});

test("caretForDigits lands after the same digit the user was on", () => {
  // "12345" -> "12,345": caret after 3 digits sits past the "3".
  assert.equal(caretForDigits("12,345", 3), 4);
  assert.equal(caretForDigits("12,345", 0), 0);
  assert.equal(caretForDigits("12,345", 5), 6);
  assert.equal(caretForDigits("12,345", 99), 6);
});
