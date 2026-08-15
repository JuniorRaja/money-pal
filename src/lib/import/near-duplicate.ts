import type { PossibleDuplicate } from "@/data/schema";
import { dayKey } from "../money";

/**
 * The exact-hash dedupe (DECISIONS — "Import — hash dedupe") cannot see a
 * duplicate whose narration was rewritten by whatever produced the second file.
 * Match instead on the fields that do not drift — account, signed amount, date —
 * and **flag, never auto-skip**: two genuine ₹200 Swiggy orders on one day are
 * indistinguishable from a duplicate here. A false flag costs one click; a
 * missed duplicate corrupts the ledger.
 */

/**
 * ±1 day, because banks routinely differ by one between a CSV's transaction
 * date and a converted statement's value date for the same entry.
 */
export const NEAR_DUPLICATE_DAY_WINDOW = 1;

export interface MatchableRow {
  id: string;
  account_id: string;
  occurred_at: string;
  amount_paise: number;
  type: "income" | "expense";
}

/** A committed ledger entry: `amount` is already signed (`v_transactions_flat`). */
export interface MatchableTransaction {
  id: string;
  account_id: string;
  occurred_at: string;
  amount: number;
  merchant: string | null;
}

/** Staged rows carry a positive amount plus a direction; entries carry a sign. */
export function signedAmountPaise(row: {
  amount_paise: number;
  type: "income" | "expense";
}): number {
  return row.type === "income" ? Math.abs(row.amount_paise) : -Math.abs(row.amount_paise);
}

/** IST calendar day as a day number. Never slice the ISO string (DECISIONS #15). */
function dayNumber(iso: string): number {
  return Date.parse(`${dayKey(iso)}T00:00:00Z`) / 86_400_000;
}

export function matchNearDuplicates(
  rows: readonly MatchableRow[],
  committed: readonly MatchableTransaction[],
): Map<string, PossibleDuplicate> {
  const byAccountAmount = new Map<string, MatchableTransaction[]>();
  for (const txn of committed) {
    const key = `${txn.account_id}|${txn.amount}`;
    const bucket = byAccountAmount.get(key);
    if (bucket) bucket.push(txn);
    else byAccountAmount.set(key, [txn]);
  }

  const matches = new Map<string, PossibleDuplicate>();
  for (const row of rows) {
    const bucket = byAccountAmount.get(`${row.account_id}|${signedAmountPaise(row)}`);
    if (!bucket) continue;
    const day = dayNumber(row.occurred_at);

    let best: MatchableTransaction | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const txn of bucket) {
      const gap = Math.abs(dayNumber(txn.occurred_at) - day);
      if (gap <= NEAR_DUPLICATE_DAY_WINDOW && gap < bestGap) {
        best = txn;
        bestGap = gap;
      }
    }
    if (!best) continue;

    matches.set(row.id, {
      id: best.id,
      occurred_at: best.occurred_at,
      amount_paise: Math.abs(best.amount),
      merchant: best.merchant ?? "",
    });
  }
  return matches;
}
