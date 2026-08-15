import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyHeuristics, extractMerchant } from "./heuristics.ts";

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
