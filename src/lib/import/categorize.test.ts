import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCategorizationPayload,
  requestCategorizationWithRetry,
  unresolvedCategorizationGroups,
  validateCategorizationResponse,
  type CategorizationCategory,
  type CategorizationGroup,
} from "./categorize";

const categories: CategorizationCategory[] = [
  { id: "dining-id", name: "Dining", group: "lifestyle" },
  { id: "salary-id", name: "Salary", group: "income" },
  { id: "transfer-id", name: "Transfer", group: "transfer" },
];

function group(id = "g1", options: Partial<CategorizationGroup> = {}): CategorizationGroup {
  return {
    id,
    label: "FAGS",
    kind: "note",
    count: 3,
    direction: "expense",
    cadence: "monthly",
    amountStability: "exact",
    humanRound: true,
    magnitude: "small",
    ...options,
  };
}

function response(suggestions: unknown[]): string {
  return JSON.stringify({ suggestions });
}

describe("AI import categorization", () => {
  it("sends only derived group labels, shapes, and listed category labels", () => {
    const rawNarration = "UPI-P2P-PRIVATE-NARRATION-987654";
    const payload = buildCategorizationPayload(
      [
        {
          ...group(),
          narration: rawNarration,
          amount_paise: 123_456,
          occurred_on: "2026-11-08",
          account_id: "private-account-id",
        } as CategorizationGroup,
      ],
      categories,
    );
    const serialized = JSON.stringify(payload);
    assert.deepEqual(Object.keys(payload.groups[0]!), [
      "id",
      "label",
      "kind",
      "count",
      "direction",
      "cadence",
      "amountStability",
      "humanRound",
      "magnitude",
    ]);
    assert.ok(!serialized.includes(rawNarration));
    assert.ok(
      !/amount_paise|occurred_on|balance|narration|account_id|transaction_id/i.test(serialized),
    );
    assert.deepEqual(Object.keys(payload.categories[0]!), ["id", "name", "group"]);
  });

  it("ignores fabricated group ids and keeps valid suggestions", () => {
    const result = validateCategorizationResponse(
      response([
        { id: "invented", categoryId: "dining-id", confidence: 0.7 },
        { id: "g1", categoryId: "dining-id", confidence: 0.7 },
      ]),
      [group()],
      categories,
    );
    assert.equal(result?.length, 1);
    assert.equal(result?.[0]?.categoryId, "dining-id");
  });

  it("rejects unlisted categories and categories with the wrong direction", () => {
    const result = validateCategorizationResponse(
      response([
        { id: "g1", categoryId: "fabricated-category", confidence: 0.9 },
        { id: "g2", categoryId: "salary-id", confidence: 0.9 },
      ]),
      [group(), group("g2")],
      categories,
    );
    assert.ok(result?.every((suggestion) => suggestion.categoryId === null));
  });

  it("keeps at most five new category proposals", () => {
    const groups = Array.from({ length: 9 }, (_, index) => group(`g${index + 1}`));
    const result = validateCategorizationResponse(
      response(
        groups.map((item, index) => ({
          id: item.id,
          categoryId: null,
          categoryName: `New category ${index + 1}`,
          isNew: true,
          kind: "lifestyle",
          confidence: 0.6,
        })),
      ),
      groups,
      categories,
    );
    assert.equal(result?.filter((suggestion) => suggestion.isNew).length, 5);
    assert.equal(result?.length, 9);
  });

  it("caps confidence at 0.75 and never guesses a category for an unknown person-to-person group", () => {
    const result = validateCategorizationResponse(
      response([
        { id: "g1", categoryId: "dining-id", confidence: 0.99 },
        {
          id: "g2",
          categoryId: null,
          categoryName: null,
          isNew: false,
          kind: null,
          confidence: 0.2,
        },
      ]),
      [group(), group("g2", { label: "APURVASIGAMANI", kind: "payee", direction: "income" })],
      categories,
    );
    assert.equal(result?.[0]?.confidence, 0.75);
    assert.equal(result?.[1]?.categoryId, null);
    assert.equal(result?.[1]?.categoryName, null);
  });

  it("does not ask AI to reconsider groups already categorized by rules or keywords", () => {
    const groups = [
      { id: "known", suggestedCategoryName: "Dining", source: "keyword" },
      { id: "unknown", suggestedCategoryName: null, source: null },
    ];
    assert.deepEqual(
      unresolvedCategorizationGroups(groups).map((item) => item.id),
      ["unknown"],
    );
  });

  it("makes no network call when disabled or provider credentials are absent", async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return "{}";
    };
    assert.deepEqual(
      await requestCategorizationWithRetry([group()], categories, request, {
        enabled: false,
        available: true,
      }),
      [],
    );
    assert.deepEqual(
      await requestCategorizationWithRetry([group()], categories, request, {
        enabled: true,
        available: false,
      }),
      [],
    );
    assert.equal(calls, 0);
  });

  it("silently gives up after one retry on API errors, malformed output, or timeout", async () => {
    let errors = 0;
    assert.deepEqual(
      await requestCategorizationWithRetry(
        [group()],
        categories,
        async () => {
          errors += 1;
          throw new Error("API 500");
        },
        { enabled: true, available: true },
      ),
      [],
    );
    assert.equal(errors, 2);

    let malformed = 0;
    assert.deepEqual(
      await requestCategorizationWithRetry(
        [group()],
        categories,
        async () => {
          malformed += 1;
          return "not json";
        },
        { enabled: true, available: true },
      ),
      [],
    );
    assert.equal(malformed, 2);

    let timeouts = 0;
    assert.deepEqual(
      await requestCategorizationWithRetry(
        [group()],
        categories,
        (_payload, signal) => {
          timeouts += 1;
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        },
        { enabled: true, available: true, timeoutMs: 1 },
      ),
      [],
    );
    assert.equal(timeouts, 2);
  });
});
