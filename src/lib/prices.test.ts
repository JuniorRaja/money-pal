import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feedFor, parseAmfiNav, parseYahooQuote } from "./prices.ts";

// A trimmed slice of NAVAll.txt: header row, a fund-house heading, the ";;;;;"
// separator AMFI emits between houses, two real rows, and a suspended scheme
// whose NAV cell reads "N.A." — all four junk shapes the parser must survive.
const AMFI_SAMPLE = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

Parag Parikh Mutual Fund
;;;;;
122639;INF879O01027;INF879O01019;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;92.4567;16-Aug-2026
119551;INF209KB1CQ2;INF209KB1CR0;Aditya Birla Sun Life Banking & PSU Debt Fund - Direct - IDCW;100.9483;16-Aug-2026
118834;INF209K01YM2;INF209K01YN0;Some Suspended Scheme - Direct - Growth;N.A.;16-Aug-2026
`;

describe("parseAmfiNav", () => {
  it("keeps priced rows and skips every heading and separator", () => {
    const navs = parseAmfiNav(AMFI_SAMPLE);
    assert.equal(navs.size, 2);
    assert.deepEqual([...navs.keys()].sort(), ["119551", "122639"]);
  });

  it("converts rupee NAVs to paise", () => {
    const navs = parseAmfiNav(AMFI_SAMPLE);
    assert.equal(navs.get("122639"), 9246); // 92.4567 → 9245.67 → 9246
    assert.equal(navs.get("119551"), 10095); // 100.9483 → 10094.83 → 10095
  });

  it("drops a scheme whose NAV is not a number rather than pricing it at zero", () => {
    assert.equal(parseAmfiNav(AMFI_SAMPLE).has("118834"), false);
  });

  it("returns an empty map for an empty or garbage file", () => {
    assert.equal(parseAmfiNav("").size, 0);
    assert.equal(parseAmfiNav("<html>503 Service Unavailable</html>").size, 0);
  });
});

describe("parseYahooQuote", () => {
  const quote = (meta: unknown) => ({ chart: { result: [{ meta }], error: null } });

  it("reads regularMarketPrice as paise", () => {
    assert.equal(parseYahooQuote(quote({ regularMarketPrice: 1432.65 })), 143265);
  });

  it("returns null for every shape that is not a usable price", () => {
    for (const bad of [
      null,
      undefined,
      "rate limited",
      {},
      { chart: { result: [], error: "Not Found" } },
      quote({}),
      quote({ regularMarketPrice: null }),
      quote({ regularMarketPrice: "1432.65" }), // string, not the documented number
      quote({ regularMarketPrice: 0 }),
      quote({ regularMarketPrice: -5 }),
    ]) {
      assert.equal(parseYahooQuote(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe("feedFor", () => {
  it("routes gold through the equity feed and leaves hand-priced classes unfed", () => {
    assert.equal(feedFor("mutual_fund"), "amfi");
    assert.equal(feedFor("equity"), "yahoo");
    assert.equal(feedFor("gold"), "yahoo");
    assert.equal(feedFor("fixed_income"), null);
    assert.equal(feedFor("property"), null);
    assert.equal(feedFor("crypto"), null);
  });
});
