import { test } from "node:test";
import assert from "node:assert/strict";
import { periodBounds, shiftPeriod } from "./period";

test("periodBounds returns IST month range, end = next month start", () => {
  assert.deepEqual(periodBounds("2026-08"), {
    start: "2026-08-01T00:00:00+05:30",
    end: "2026-09-01T00:00:00+05:30",
  });
});

test("periodBounds rolls the year at December", () => {
  assert.deepEqual(periodBounds("2026-12"), {
    start: "2026-12-01T00:00:00+05:30",
    end: "2027-01-01T00:00:00+05:30",
  });
});

test("periodBounds start is the IST instant of the 1st, i.e. 18:30Z the day before", () => {
  // Postgres stores IST midnight as the prior day 18:30Z; the range boundary
  // must match so the 1st of the month is never dropped into the month before.
  const { start } = periodBounds("2026-08");
  assert.equal(new Date(start).toISOString(), "2026-07-31T18:30:00.000Z");
});

test("shiftPeriod underpins the exclusive end bound", () => {
  assert.equal(shiftPeriod("2026-12", 1), "2027-01");
});
