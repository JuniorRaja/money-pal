import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { KEYWORD_RULES } from "./keywords.ts";
import { applyHeuristics } from "./heuristics.ts";

describe("import keyword rules", () => {
  it("has uppercase non-empty keywords without cross-category collisions", () => {
    const owners = new Map<string, string>();
    for (const rule of KEYWORD_RULES) {
      for (const keyword of rule.keywords) {
        assert.ok(keyword.trim(), `${rule.category} has an empty keyword`);
        assert.equal(keyword, keyword.toUpperCase(), `${keyword} is not uppercase`);
        const owner = owners.get(keyword);
        assert.ok(
          !owner || owner === rule.category,
          `${keyword} belongs to both ${owner} and ${rule.category}`,
        );
        owners.set(keyword, rule.category);
      }
    }
  });

  it("keeps at least 350 keywords and only uses seeded categories", () => {
    const keywordCount = KEYWORD_RULES.reduce((count, rule) => count + rule.keywords.length, 0);
    const seedSql = [
      "supabase/migrations/20260811150500_seed_categories_and_profile_trigger.sql",
      "supabase/migrations/20261108100000_seed_insurance_category.sql",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    assert.ok(keywordCount >= 350, `Expected at least 350 keywords; found ${keywordCount}`);
    for (const rule of KEYWORD_RULES) {
      assert.ok(
        seedSql.includes(`'${rule.category}'`),
        `${rule.category} is missing from seed SQL`,
      );
    }
  });

  it("applies expanded India-weighted keywords with direction guards", () => {
    assert.equal(
      applyHeuristics({ narration: "UPI-WOW MOMO", type: "expense" }).suggested_category_name,
      "Dining",
    );
    assert.equal(
      applyHeuristics({ narration: "UPI-NAMMA YATRI", type: "expense" }).suggested_category_name,
      "Transport",
    );
    assert.equal(
      applyHeuristics({ narration: "LIC PREMIUM", type: "expense" }).suggested_category_name,
      "Insurance",
    );
    assert.equal(
      applyHeuristics({ narration: "INVOICE", type: "expense" }).suggested_category_name,
      null,
    );
  });

  it("does not match short or generic substrings inside unrelated narrations", () => {
    assert.equal(
      applyHeuristics({
        narration: "NEFT CR-SBIN0000123-MAHARASHTRA STATE ELECTRICITY BOARD",
        type: "expense",
      }).suggested_category_name,
      "Utilities",
    );
    assert.equal(
      applyHeuristics({
        narration: "NEFT CR-SBIN0000123-RESTAURANT EQUIPMENT",
        type: "expense",
      }).suggested_category_name,
      null,
    );
  });
});
