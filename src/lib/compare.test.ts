import assert from "node:assert/strict";
import { test } from "node:test";

import type { Account, AccountKind, MonthlyRollup, Transaction } from "@/data/schema";
import { NET_WORTH_KINDS } from "@/data/schema";
import {
  balanceChange,
  balanceTrend,
  monthWindows,
  pctChange,
  rollupWindow,
  savingsRate,
  windowLabel,
} from "@/lib/compare";
import { formatPct, formatPoints } from "@/lib/money";

/** `trend` points are paise / 100_000, matching `trendFor` in data/live.ts. */
const account = (kind: AccountKind, paise: number[]): Account =>
  ({
    id: `${kind}-${paise.join("-")}`,
    kind,
    balance: paise[paise.length - 1] ?? 0,
    trend: paise.map((p) => p / 100_000),
  }) as Account;

const txn = (occurred_at: string, amount: number): Transaction =>
  ({
    id: occurred_at + amount,
    transaction_id: occurred_at + amount,
    occurred_at,
    amount,
    type: amount > 0 ? "income" : "expense",
  }) as Transaction;

const rollup = (period: string, income: number, expense: number): MonthlyRollup => ({
  period,
  income,
  expense,
  planned: 0,
});

test("pctChange has no baseline to divide by when prior is zero", () => {
  assert.equal(pctChange(500, 0), null);
  assert.equal(pctChange(0, 0), null);
  assert.equal(pctChange(0, 500), -100);
});

test("pctChange measures against |prior| so paying down debt reads as positive", () => {
  assert.equal(pctChange(-30_000, -50_000), 40);
  assert.equal(pctChange(-70_000, -50_000), -40);
});

test("balanceTrend sums a bucket into whole paise, oldest first", () => {
  const accounts = [account("bank", [100_00, 200_00]), account("cash", [50_00, 50_00])];
  assert.deepEqual(balanceTrend(accounts, NET_WORTH_KINDS.cash), [150_00, 250_00]);
  assert.deepEqual(balanceTrend(accounts, NET_WORTH_KINDS.investments), []);
});

test("balanceTrend aligns shorter series to the newest month", () => {
  const accounts = [account("bank", [100_00, 200_00, 300_00]), account("bank", [7_00])];
  assert.deepEqual(balanceTrend(accounts, NET_WORTH_KINDS.cash), [100_00, 200_00, 307_00]);
});

test("balanceChange compares today against the close of last month", () => {
  const accounts = [account("bank", [800_00, 1000_00, 1200_00])];
  const mom = balanceChange(accounts, NET_WORTH_KINDS.cash);
  assert.deepEqual(mom, { current: 1200_00, prior: 1000_00, pct: 20 });

  const quarter = balanceChange(accounts, NET_WORTH_KINDS.cash, { months: 2 });
  assert.equal(quarter?.pct, 50);
});

test("balanceChange returns null when history is shorter than the span asked for", () => {
  const accounts = [account("bank", [1000_00])];
  assert.equal(balanceChange(accounts, NET_WORTH_KINDS.cash), null);
  assert.equal(balanceChange([], NET_WORTH_KINDS.cash), null);
});

test("balanceChange on a fresh account reports no delta rather than a fake 100%", () => {
  // Funded this month: the back-cast puts zero at last month's close.
  const accounts = [account("bank", [0, 25_000_00])];
  assert.deepEqual(balanceChange(accounts, NET_WORTH_KINDS.cash), {
    current: 25_000_00,
    prior: 0,
    pct: null,
  });
});

test("balanceChange in magnitude mode reads debt as growing or shrinking", () => {
  const cards = [account("credit_card", [-50_000_00, -30_000_00])];
  const change = balanceChange(cards, NET_WORTH_KINDS.liabilities, { magnitude: true });
  // Debt fell by 40% — the card renders this negative-is-good.
  assert.equal(change?.pct, -40);
  assert.equal(change?.current, -30_000_00);
});

test("monthWindows cuts both months at the same day of month", () => {
  const rows = [
    txn("2026-08-01T10:00:00+05:30", -100),
    txn("2026-08-15T10:00:00+05:30", -200),
    txn("2026-08-20T10:00:00+05:30", -400), // after today, excluded
    txn("2026-07-10T10:00:00+05:30", -50),
    txn("2026-07-28T10:00:00+05:30", -800), // past day 15, excluded
    txn("2026-06-05T10:00:00+05:30", -900), // not either window
  ];
  const w = monthWindows(rows, new Date(2026, 7, 15));
  assert.equal(w.period, "2026-08");
  assert.equal(w.priorPeriod, "2026-07");
  assert.equal(w.throughDay, 15);
  assert.equal(w.priorThroughDay, 15);
  assert.deepEqual(
    w.current.map((t) => t.amount),
    [-100, -200],
  );
  assert.deepEqual(
    w.prior.map((t) => t.amount),
    [-50],
  );
});

test("monthWindows caps the prior window at the shorter month's length", () => {
  const w = monthWindows([], new Date(2026, 2, 31)); // 31 March
  assert.equal(w.priorPeriod, "2026-02");
  assert.equal(w.throughDay, 31);
  assert.equal(w.priorThroughDay, 28);
});

test("monthWindows buckets by IST day, not by the raw UTC string", () => {
  // Midnight IST on 1 August comes back from Postgres as 31 July, 18:30 UTC.
  const w = monthWindows([txn("2026-07-31T18:30:00+00:00", -100)], new Date(2026, 7, 15));
  assert.equal(w.current.length, 1);
  assert.equal(w.prior.length, 0);
});

test("rollupWindow spans complete months only and skips the running one", () => {
  const rollups = [
    rollup("2026-05", 100, 40),
    rollup("2026-06", 100, 40),
    rollup("2026-07", 200, 60),
    rollup("2026-08", 999, 999), // current month, must not count
  ];
  const w = rollupWindow(rollups, 2, new Date(2026, 7, 15));
  assert.equal(w.income, 300); // Jun + Jul
  assert.equal(w.expense, 100);
  assert.equal(w.covered, 2);
  assert.deepEqual(w.prior, { income: 100, expense: 40 }); // Apr + May, only May exists
});

test("rollupWindow treats a month with no rows as zero, not as missing", () => {
  const w = rollupWindow([rollup("2026-07", 200, 60)], 3, new Date(2026, 7, 15));
  assert.equal(w.income, 200);
  assert.equal(w.covered, 1);
  assert.equal(w.size, 3);
  assert.equal(w.prior, null); // nothing at all before — no comparison
});

test("rollupWindow on a brand new user has nothing to show", () => {
  const w = rollupWindow([], 6, new Date(2026, 7, 15));
  assert.deepEqual(w, { size: 6, covered: 0, income: 0, expense: 0, prior: null });
});

test("savingsRate refuses to divide by no income", () => {
  assert.equal(savingsRate(0, 5000), null);
  assert.equal(savingsRate(-1, 0), null);
  assert.equal(savingsRate(100_00, 25_00), 75);
  assert.equal(savingsRate(100_00, 150_00), -50); // overspent
});

test("windowLabel names the exact stretch a delta was measured against", () => {
  assert.equal(windowLabel("2026-07", 15), "1–15 Jul");
});

test("formatPct clamps a runaway ratio instead of blowing out the card", () => {
  assert.equal(formatPct(12.34), "+12.3%");
  assert.equal(formatPct(-12.34), "−12.3%");
  assert.equal(formatPct(0), "0.0%");
  assert.equal(formatPct(9_999_900), "+999%+");
  assert.equal(formatPct(-1000), "−999%+");
});

test("formatPoints keeps rate gaps visually distinct from ratios", () => {
  assert.equal(formatPoints(3.2), "+3.2 pp");
  assert.equal(formatPoints(-3.2), "−3.2 pp");
});
