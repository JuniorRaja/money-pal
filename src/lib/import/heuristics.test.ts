import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyHeuristics, extractMerchant, extractNote } from "./heuristics.ts";

describe("merchant extraction", () => {
  it("keeps the whole name out of a hyphenated UPI narration", () => {
    // Regression: `[^/-@]` is the range / → @, which excludes every digit, so
    // this used to be cut at the "3" of the handle and read "J Amaliya Cool Bar-q".
    assert.equal(
      extractMerchant("UPI-J AMALIYA COOL BAR-Q356602405@YBL-HDFC0000123-PAYMENT"),
      "J Amaliya Cool Bar",
    );
  });

  it("still reads the common rails", () => {
    assert.equal(extractMerchant("UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT"), "Swiggy");
    assert.equal(extractMerchant("UPI-AMAZON-amazonpay@apl-0000-333-SHOP"), "Amazon");
    assert.equal(
      extractMerchant("NEFT CR-SBIN0000123-ACME INDIA PVT LTD-SALARY AUG"),
      "Acme India Pvt Ltd",
    );
  });

  it("returns nothing for narration that is only rails and reference numbers", () => {
    // "P2p 622157719873#09" is not a merchant — saying nothing is more honest.
    assert.equal(extractMerchant("IMPS P2P 622157719873#09"), "");
  });

  it("drops a merchantless row to low confidence and shows the raw narration", () => {
    const result = applyHeuristics({ narration: "IMPS P2P 622157719873#09", type: "expense" });
    assert.equal(result.confidence, 0.2);
    assert.equal(result.merchant, "IMPS P2P 622157719873#09");
    assert.equal(result.suggested_category_name, null);
  });

  it("keeps categorising when a keyword matches", () => {
    const result = applyHeuristics({
      narration: "UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-111111-PAYMENT",
      type: "expense",
    });
    assert.equal(result.suggested_category_name, "Dining");
    assert.equal(result.merchant, "Swiggy");
  });
});

describe("payment note extraction", () => {
  it("reads the note you typed off the end of the narration", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["IMPS-615466074286-BALASUBRAMANIAM-TMBL-XXXXXXXXXXX0859-CONSTRUCTION", "CONSTRUCTION"],
      ["IMPS-616232121393-KRISHNA KUMAR-SBIN-XXXXXXX1893-RENT MAY", "RENT MAY"],
      ["UPI-M O COOL BAR-Q693365448@YBL-YESB0YBLUPI-192342317477-TEA", "TEA"],
      [
        "UPI-KAVITHA P-YESPAY.SFLSTERM.FB1J2OGR@YESBANKLTD-YESB0YESUPI-728746666638-CAFETERIA",
        "CAFETERIA",
      ],
      ["UPI-APURVASIGAMANI-Q441555410@YBL-YESB0YBLUPI-861873771914-FAGS", "FAGS"],
      ["UPI-J AMALIYA COOL BAR-Q356602405@YBL-YESB0YBLUPI-551426053310-FAGS", "FAGS"],
    ];
    for (const [narration, note] of cases) {
      assert.equal(extractNote(narration), note, narration);
    }
  });

  it("returns nothing when the narration just ends with its own structure", () => {
    // No note typed: the tail is the reference number, the masked account, the
    // IFSC or the VPA — none of which belong in a note field.
    const cases: readonly string[] = [
      "UPI-M O COOL BAR-Q693365448@YBL-YESB0YBLUPI-192342317477",
      "IMPS-615466074286-BALASUBRAMANIAM-TMBL-XXXXXXXXXXX0859",
      "UPI-APURVASIGAMANI-Q441555410@YBL-192342317477-YESB0YBLUPI",
      "UPI-SWIGGY-SWIGGY@YBL-HDFC0001234-swiggy@ybl",
      "UPI-SWIGGY",
      "IMPS P2P 622157719873#09",
      "",
    ];
    for (const narration of cases) {
      assert.equal(extractNote(narration), null, narration);
    }
  });

  it("keeps a note that merely contains digits", () => {
    // Only long digit runs are reference numbers; "RENT 2024" is a real note.
    assert.equal(
      extractNote("IMPS-616232121393-KRISHNA KUMAR-SBIN-XXXXXXX1893-RENT 2024"),
      "RENT 2024",
    );
  });

  it("rides along on applyHeuristics without disturbing the merchant", () => {
    const result = applyHeuristics({
      narration: "UPI-M O COOL BAR-Q693365448@YBL-YESB0YBLUPI-192342317477-TEA",
      type: "expense",
    });
    assert.equal(result.note, "TEA");
    assert.equal(result.merchant, "M O Cool Bar");
  });
});
