import { parseStatementDate } from "./normalize";
import { rowLooksLikeHeader } from "./presets";

export type PositionedItem = { str: string; x: number; y: number };

// ponytail: fixed row tolerance tuned against one bank's PDF (HDFC savings).
// If a new bank's rows misgroup, make this per-preset instead of global.
const ROW_TOLERANCE = 2.5;
const COLUMN_GAP = 8;

/**
 * Extract text spans with position, cluster into rows by y, then align each
 * row onto column anchors taken from the header row's own x-positions.
 *
 * Anchoring on the header (rather than clustering x-positions across the
 * whole page) matters because a real bank PDF's header labels don't sit at
 * the same x as their column's data — e.g. a left-aligned "Withdrawal Amt."
 * label over right-aligned numbers — and the page also carries unrelated
 * text (customer details, disclaimers) at arbitrary x. Filtering rows down
 * to ones that carry a real date, then DP-aligning each row's items onto
 * the header anchors, sidesteps both problems without a bank-specific
 * layout hack.
 */
export function gridFromItems(items: PositionedItem[]): string[][] {
  if (items.length === 0) return [];
  const rows = clusterRows(items);

  const headerIndex = rows.findIndex((row) => rowLooksLikeHeader(row.map((item) => item.str)));
  // A transaction row always carries its own date; nothing else on a bank
  // statement page (customer details, disclaimers, the summary block) does,
  // so this finds the table without a bank-specific stop marker.
  const dataRows = rows.filter((row) => row.some((item) => parseStatementDate(item.str) !== null));

  if (headerIndex < 0 && dataRows.length === 0) return [];

  const headerRow = headerIndex >= 0 ? rows[headerIndex] : undefined;
  const anchors = headerRow
    ? headerRow.map((item) => item.x)
    : clusterColumns(dataRows.flatMap((row) => row.map((item) => item.x)));

  const tableRows = headerRow ? [headerRow, ...dataRows] : dataRows;
  return tableRows.map((row) => alignRowToAnchors(row, anchors));
}

function clusterRows(items: PositionedItem[]): PositionedItem[][] {
  // PDF y grows upward, so top-to-bottom reading order is descending y.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PositionedItem[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    const anchor = row?.[0];
    if (row && anchor && Math.abs(anchor.y - item.y) <= ROW_TOLERANCE) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

/** Gap-based 1D clustering of x start-positions, used only when no header row is found. */
function clusterColumns(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const first = sorted[0];
  if (first === undefined) return [];
  const starts: number[] = [first];
  let prev = first;
  for (const x of sorted.slice(1)) {
    if (x - prev > COLUMN_GAP) starts.push(x);
    prev = x;
  }
  return starts;
}

/**
 * Assign a row's items to column anchors via the cheapest order-preserving
 * (monotonic) match — item i's anchor index is always >= item i-1's. Plain
 * nearest-anchor-per-item is not good enough here: a row missing a column
 * (e.g. a debit-only transaction has no "Deposit" value) can leave the
 * nearest anchor to a value being the WRONG neighbouring column. Solving
 * for the row as a whole, so every other item's placement constrains it,
 * gets this right; a per-item nearest match does not.
 */
function alignRowToAnchors(row: PositionedItem[], anchors: number[]): string[] {
  const n = anchors.length;
  const cells: string[][] = anchors.map(() => []);
  const m = row.length;
  if (n === 0 || m === 0) return cells.map(() => "");

  let dp: number[] = anchors.map((a) => Math.abs(row[0]!.x - a));
  const backPointers: number[][] = [];

  for (let i = 1; i < m; i += 1) {
    const next: number[] = new Array(n).fill(Infinity);
    const back: number[] = new Array(n).fill(-1);
    let bestPrefix = Infinity;
    let bestPrefixIndex = -1;
    for (let k = 0; k < n; k += 1) {
      if (dp[k]! < bestPrefix) {
        bestPrefix = dp[k]!;
        bestPrefixIndex = k;
      }
      next[k] = bestPrefix + Math.abs(row[i]!.x - anchors[k]!);
      back[k] = bestPrefixIndex;
    }
    backPointers.push(back);
    dp = next;
  }

  let bestK = 0;
  for (let k = 1; k < n; k += 1) if (dp[k]! < dp[bestK]!) bestK = k;

  const assignment: number[] = new Array(m).fill(0);
  assignment[m - 1] = bestK;
  for (let i = m - 1; i > 0; i -= 1) {
    assignment[i - 1] = backPointers[i - 1]![assignment[i]!]!;
  }

  for (let i = 0; i < m; i += 1) cells[assignment[i]!]!.push(row[i]!.str);
  return cells.map((parts) => parts.join(" ").trim());
}
