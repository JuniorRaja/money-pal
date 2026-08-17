/**
 * Period-over-period comparison maths.
 *
 * Pure and Supabase-free on purpose so `compare.test.ts` can pin every edge
 * case down. Two sources of history, deliberately kept apart:
 *
 *  - `Account.trend` — 12 monthly balance points back-cast from the ledger
 *    (see `trendFor` in `data/live.ts`). Month-boundary accurate, so every
 *    balance delta comes from here.
 *  - `MonthlyRollup` — income/expense per calendar month, present only for
 *    months that have rows. A gap means no money moved, so it reads as zero.
 *
 * Every function returns `null` rather than a made-up number when there is no
 * honest basis for a comparison. A blank card beats a confident lie.
 */
import type { Account, AccountKind, MonthlyRollup, Paise, Transaction } from "@/data/schema";
import { dayKey } from "@/lib/money";
import { currentPeriod, daysInPeriod, shiftPeriod } from "@/lib/period";

export interface Comparison {
  current: number;
  prior: number;
  /** Relative change, or null when there is no baseline to divide by. */
  pct: number | null;
}

/**
 * Relative change against `|prior|`, so signed balances behave: a liability
 * going −50,000 → −30,000 reads as +40% (improved), not −40%.
 */
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

/**
 * Monthly balance history for a set of account kinds, oldest first, in paise.
 *
 * Series are aligned from the newest point backwards, so an account with a
 * shorter history contributes nothing to the older months instead of shifting
 * everyone else's timeline. In practice `live.ts` always emits 12 points.
 */
export function balanceTrend(accounts: Account[], kinds: readonly AccountKind[]): Paise[] {
  const rows = accounts.filter((a) => kinds.includes(a.kind) && a.trend.length > 0);
  if (rows.length === 0) return [];
  const length = Math.max(...rows.map((a) => a.trend.length));
  const out = new Array<number>(length).fill(0);
  for (const a of rows) {
    const offset = length - a.trend.length;
    a.trend.forEach((point, i) => {
      out[offset + i] = (out[offset + i] ?? 0) + point;
    });
  }
  // Trend points are paise / 100_000 (`trendFor`); undo that so callers keep
  // dealing in whole paise. Math.round makes the float round-trip exact.
  return out.map((p) => Math.round(p * 100_000));
}

/**
 * Change in a balance bucket over `months` months.
 *
 * `months: 1` is "so far this month" — the newest trend point is today's
 * balance and the one before it is the balance at the close of last month.
 * `magnitude` compares absolute values, which is what you want for debt: the
 * question is whether there is more of it, not which way the sign points.
 */
export function balanceChange(
  accounts: Account[],
  kinds: readonly AccountKind[],
  opts: { months?: number; magnitude?: boolean } = {},
): Comparison | null {
  const { months = 1, magnitude = false } = opts;
  const trend = balanceTrend(accounts, kinds);
  const current = trend[trend.length - 1];
  const prior = trend[trend.length - 1 - months];
  if (current === undefined || prior === undefined) return null;
  return {
    current,
    prior,
    pct: magnitude ? pctChange(Math.abs(current), Math.abs(prior)) : pctChange(current, prior),
  };
}

export interface MonthWindows {
  period: string;
  priorPeriod: string;
  /** Day of month this month's window runs to — today. */
  throughDay: number;
  /** Same day in the prior month, capped to its length (31 Mar → 28 Feb). */
  priorThroughDay: number;
  current: Transaction[];
  prior: Transaction[];
}

/**
 * This month so far, next to the same stretch of days last month.
 *
 * Never compare a part month against a whole one — every 1st of the month
 * would read as a 95% collapse in spending.
 */
export function monthWindows(rows: Transaction[], now = new Date()): MonthWindows {
  const period = currentPeriod(now);
  const priorPeriod = shiftPeriod(period, -1);
  const throughDay = now.getDate();
  const priorThroughDay = Math.min(throughDay, daysInPeriod(priorPeriod));
  return {
    period,
    priorPeriod,
    throughDay,
    priorThroughDay,
    current: entriesThroughDay(rows, period, throughDay),
    prior: entriesThroughDay(rows, priorPeriod, priorThroughDay),
  };
}

/** Entries in `period` up to and including day-of-month `throughDay`, IST. */
function entriesThroughDay(rows: Transaction[], period: string, throughDay: number) {
  return rows.filter((t) => {
    const day = dayKey(t.occurred_at);
    return day.startsWith(period) && Number(day.slice(8, 10)) <= throughDay;
  });
}

export interface RollupWindow {
  /** Calendar months the window spans — always `size`. */
  size: number;
  /** How many of them actually carry ledger rows. */
  covered: number;
  income: Paise;
  expense: Paise;
  /** The same-length window immediately before this one; null when it is empty. */
  prior: { income: Paise; expense: Paise } | null;
}

/**
 * The `size` **complete** calendar months ending with the month before `now`.
 *
 * The running month is left out on purpose: half of August against all of July
 * is not a trend, it is a calendar artefact.
 */
export function rollupWindow(
  rollups: MonthlyRollup[],
  size: number,
  now = new Date(),
): RollupWindow {
  const by = new Map(rollups.map((r) => [r.period, r] as const));
  const end = shiftPeriod(currentPeriod(now), -1);
  const sum = (offset: number) => {
    let income = 0;
    let expense = 0;
    let covered = 0;
    for (let i = 0; i < size; i += 1) {
      const row = by.get(shiftPeriod(end, -(offset + i)));
      if (!row) continue;
      income += row.income;
      expense += row.expense;
      covered += 1;
    }
    return { income, expense, covered };
  };
  const current = sum(0);
  const prior = sum(size);
  return {
    size,
    covered: current.covered,
    income: current.income,
    expense: current.expense,
    prior: prior.covered === 0 ? null : { income: prior.income, expense: prior.expense },
  };
}

/** Share of income kept. Null when there was no income to divide by. */
export function savingsRate(income: Paise, expense: Paise): number | null {
  if (income <= 0) return null;
  return ((income - expense) / income) * 100;
}

const monthShort = new Intl.DateTimeFormat("en-IN", { month: "short" });

/** "1–15 Jul" — the exact stretch a delta was measured against. */
export function windowLabel(period: string, throughDay: number): string {
  const month = monthShort.format(new Date(`${period}-01T00:00:00`));
  return `1–${throughDay} ${month}`;
}

/**
 * Sub-label under a balance delta. Says why the delta is missing rather than
 * leaving the row bare, which reads as a rendering bug.
 */
export function balanceHint(change: Comparison | null): string {
  if (change === null) return "no history yet";
  if (change.pct !== null) return "so far this month";
  return change.current === 0 ? "nothing here yet" : "new this month";
}
