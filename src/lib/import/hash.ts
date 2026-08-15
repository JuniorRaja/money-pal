import { normalizeNarration } from "./normalize";
import type { MappedImportRow } from "./types";

/**
 * Payload hashed as sha256(account_id | date | signed_amount | normalized_narration | n)
 * with `|` as the delimiter (no extra spaces).
 */
export function importHashPayload(input: {
  accountId: string;
  date: string;
  signedAmountPaise: number;
  narration: string;
  occurrenceIndex: number;
}): string {
  return [
    input.accountId,
    input.date,
    String(input.signedAmountPaise),
    normalizeNarration(input.narration),
    String(input.occurrenceIndex),
  ].join("|");
}

export function occurrenceKey(date: string, signedAmountPaise: number, narration: string): string {
  return `${date}|${signedAmountPaise}|${normalizeNarration(narration)}`;
}

export async function sha256Hex(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function hashImportRow(input: {
  accountId: string;
  date: string;
  signedAmountPaise: number;
  narration: string;
  occurrenceIndex: number;
}): Promise<string> {
  return sha256Hex(importHashPayload(input));
}

/**
 * Assign 0-based occurrence indexes among rows that share date + signed amount +
 * normalized narration **in this file**, then hash each row.
 */
export async function computeImportHashes(
  accountId: string,
  rows: ReadonlyArray<{ date: string; signedAmountPaise: number; narration: string }>,
): Promise<Array<{ occurrence_index: number; import_hash: string }>> {
  const seen = new Map<string, number>();
  const out: Array<{ occurrence_index: number; import_hash: string }> = [];

  for (const row of rows) {
    const key = occurrenceKey(row.date, row.signedAmountPaise, row.narration);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const import_hash = await hashImportRow({
      accountId,
      date: row.date,
      signedAmountPaise: row.signedAmountPaise,
      narration: row.narration,
      occurrenceIndex: n,
    });
    out.push({ occurrence_index: n, import_hash });
  }

  return out;
}

/** Recompute occurrence indexes and hashes once the destination account is known. */
export async function attachHashesToRows(
  accountId: string,
  rows: MappedImportRow[],
): Promise<MappedImportRow[]> {
  const hashes = await computeImportHashes(
    accountId,
    rows.map((row) => ({
      date: row.occurred_on,
      signedAmountPaise: row.amount_paise,
      narration: row.descriptor,
    })),
  );
  return rows.map((row, index) => {
    const hashed = hashes[index];
    if (!hashed) throw new Error("import hash alignment failed");
    return {
      ...row,
      import_hash: hashed.import_hash,
      occurrence_index: hashed.occurrence_index,
    };
  });
}
