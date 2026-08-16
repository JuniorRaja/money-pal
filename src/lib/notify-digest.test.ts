import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTelegramDigest } from "./notify-digest.ts";
import type { TimelineEvent } from "../data/schema.ts";

function event(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    occurred_at: "2026-08-16T12:00:00+05:30",
    kind: "money",
    title: "Groceries budget at 80%",
    detail: "8,200 of 10,000 planned — BigBasket tipped it over.",
    amount: -8200,
    account_id: "acct-1",
    action_label: "Open budgets",
    ...over,
  };
}

describe("formatTelegramDigest", () => {
  it("returns empty string when there is nothing to say", () => {
    assert.equal(formatTelegramDigest([]), "");
  });

  it("orders events oldest first and includes title + detail", () => {
    const text = formatTelegramDigest([
      event({ id: "b", occurred_at: "2026-08-16T18:00:00+05:30", title: "Later event" }),
      event({ id: "a", occurred_at: "2026-08-16T09:00:00+05:30", title: "Earlier event" }),
    ]);
    const earlierIdx = text.indexOf("Earlier event");
    const laterIdx = text.indexOf("Later event");
    assert.ok(earlierIdx >= 0 && laterIdx >= 0);
    assert.ok(earlierIdx < laterIdx);
  });

  it("caps at 15 events and notes the overflow", () => {
    const events = Array.from({ length: 18 }, (_, i) =>
      event({
        id: `evt-${i}`,
        occurred_at: `2026-08-${String(i + 1).padStart(2, "0")}T12:00:00+05:30`,
      }),
    );
    const text = formatTelegramDigest(events);
    assert.ok(text.includes("…and 3 more in the app."));
    assert.equal(text.split("\n").filter((l) => l.startsWith("• ")).length, 15);
  });
});
