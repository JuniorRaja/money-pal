import type { Category, Paise } from "@/data/schema";
import { normalizeNarration } from "./normalize";
import { normalizeNoteKey } from "./heuristics";
import type { RecurrenceShape } from "./recurrence";
import type { MappedImportRow } from "./types";

export type GroupSource = "rule" | "keyword" | "recurrence" | "ai" | null;
export type GroupBand = "settled" | "trivial" | "needs_input";

export type GroupableImportRow = Pick<
  MappedImportRow,
  | "occurrence_index"
  | "occurred_on"
  | "type"
  | "payee"
  | "note"
  | "note_key"
  | "matched_on"
  | "amount_paise"
  | "suggested_category_name"
  | "confidence"
> & {
  id?: string;
  source?: Exclude<GroupSource, null>;
};

export type ReviewGroup = {
  id: string;
  key: string;
  keyKind: "note" | "keyword" | "payee";
  type: "income" | "expense";
  label: string;
  rowIds: string[];
  rowCount: number;
  totalPaise: Paise;
  firstDate: string;
  lastDate: string;
  payees: string[];
  suggestedCategoryName: string | null;
  confidence: number;
  source: GroupSource;
  band: GroupBand;
  recurrence: RecurrenceShape | null;
};

type GroupOptions = { recurrenceShapes?: readonly RecurrenceShape[] };

function normalizedKey(value: string): string {
  return normalizeNarration(value);
}

function rowKey(row: GroupableImportRow): {
  kind: ReviewGroup["keyKind"];
  key: string;
  label: string;
} {
  const note = normalizeNoteKey(row.note_key ?? row.note);
  if (note) return { kind: "note", key: normalizedKey(note), label: note };

  if (row.suggested_category_name && row.matched_on) {
    const category = row.suggested_category_name.trim();
    return { kind: "keyword", key: normalizedKey(category), label: category };
  }

  const payee = row.payee.trim() || row.note?.trim() || "Unknown payee";
  return { kind: "payee", key: normalizedKey(payee), label: payee };
}

function recurrenceMap(shapes: readonly RecurrenceShape[]): Map<string, RecurrenceShape> {
  return new Map(
    shapes.map((shape) => [`${shape.type}:${shape.keyKind}:${normalizedKey(shape.key)}`, shape]),
  );
}

function recurrencePriority(group: ReviewGroup): number {
  return group.recurrence?.cadence === "monthly" ? 1.1 : 1;
}

export function groupRowsForReview(
  rows: readonly GroupableImportRow[],
  options: GroupOptions = {},
): ReviewGroup[] {
  const recurrenceByKey = recurrenceMap(options.recurrenceShapes ?? []);
  const groups = new Map<
    string,
    { key: string; kind: ReviewGroup["keyKind"]; label: string; rows: GroupableImportRow[] }
  >();

  for (const row of rows) {
    const key = rowKey(row);
    const id = `${row.type}:${key.kind}:${key.key}`;
    const group = groups.get(id) ?? { ...key, rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }

  return [...groups.entries()]
    .map(([id, group]): ReviewGroup => {
      const sortedRows = [...group.rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
      const resolved = [...group.rows]
        .filter((row) => row.suggested_category_name)
        .sort((a, b) => b.confidence - a.confidence)[0];
      const recurrence =
        recurrenceByKey.get(`${sortedRows[0]!.type}:${group.kind}:${group.key}`) ?? null;
      const totalPaise = group.rows.reduce((sum, row) => sum + Math.abs(row.amount_paise), 0);
      const confidence = resolved?.confidence ?? 0;
      const band: GroupBand =
        resolved && confidence >= 0.8
          ? "settled"
          : group.rows.length === 1 && totalPaise < 20_000
            ? "trivial"
            : "needs_input";
      const rowIds = group.rows.map((row) => row.id ?? String(row.occurrence_index));

      return {
        id,
        key: group.key,
        keyKind: group.kind,
        type: sortedRows[0]!.type,
        label: group.label,
        rowIds,
        rowCount: rowIds.length,
        totalPaise,
        firstDate: sortedRows[0]!.occurred_on,
        lastDate: sortedRows.at(-1)!.occurred_on,
        payees: [...new Set(group.rows.map((row) => row.payee.trim()).filter(Boolean))],
        suggestedCategoryName: resolved?.suggested_category_name ?? null,
        confidence,
        source:
          resolved?.source ?? (resolved?.matched_on ? "keyword" : resolved ? "recurrence" : null),
        band,
        recurrence,
      };
    })
    .sort((a, b) => {
      const bandOrder: Record<GroupBand, number> = { settled: 0, needs_input: 1, trivial: 2 };
      if (bandOrder[a.band] !== bandOrder[b.band]) return bandOrder[a.band] - bandOrder[b.band];
      if (a.band === "needs_input") {
        return b.totalPaise * recurrencePriority(b) - a.totalPaise * recurrencePriority(a);
      }
      return b.totalPaise - a.totalPaise;
    });
}

export function magnitudeBucket(
  totalPaise: number,
  allGroups: readonly Pick<ReviewGroup, "totalPaise">[],
): RecurrenceShape["magnitude"] {
  if (allGroups.length <= 1) return "small";
  const sorted = allGroups.map((group) => group.totalPaise).sort((a, b) => a - b);
  const rank = sorted.filter((amount) => amount <= totalPaise).length / sorted.length;
  return rank <= 1 / 3 ? "small" : rank <= 2 / 3 ? "medium" : "large";
}

export function rankCategoriesForGroup(
  group: Pick<ReviewGroup, "type" | "recurrence"> & { magnitude?: RecurrenceShape["magnitude"] },
  categories: readonly Category[],
): Category[] {
  const allowed = categories.filter((category) =>
    group.type === "income"
      ? category.group === "income" || category.group === "transfer"
      : category.group !== "income",
  );
  const shape = group.recurrence;
  let preferred: string[] | null = null;
  if (
    shape?.cadence === "monthly" &&
    shape.amountStability === "exact" &&
    group.type === "expense"
  ) {
    preferred = ["EMI", "Insurance", "Investments", "Utilities", "Rent", "Transfer"];
  } else if (
    shape?.cadence === "monthly" &&
    shape.amountStability === "variable" &&
    group.type === "expense"
  ) {
    preferred = ["Utilities", "Transport", "Groceries"];
  } else if (shape?.cadence === "monthly" && group.type === "income") {
    preferred = ["Salary", "Freelance", "Interest", "Transfer"];
  }

  const candidates = preferred
    ? allowed
        .filter((category) => preferred?.includes(category.name))
        .sort((a, b) => preferred!.indexOf(a.name) - preferred!.indexOf(b.name))
    : allowed.filter(
        (category) =>
          !(group.magnitude === "large" && group.recurrence === null) ||
          !["Dining", "Transport"].includes(category.name),
      );
  return candidates.slice(0, 4);
}

export function summariseProgress(groups: readonly Pick<ReviewGroup, "band" | "totalPaise">[]): {
  settledPaise: Paise;
  totalPaise: Paise;
  pct: number;
} {
  const totalPaise = groups.reduce((sum, group) => sum + group.totalPaise, 0);
  const settledPaise = groups
    .filter((group) => group.band !== "needs_input")
    .reduce((sum, group) => sum + group.totalPaise, 0);
  return {
    settledPaise,
    totalPaise,
    pct: totalPaise === 0 ? 100 : Math.round((settledPaise / totalPaise) * 100),
  };
}

export function matchFieldForGroup(
  group: Pick<ReviewGroup, "keyKind">,
): "note" | "narration" | "payee" {
  if (group.keyKind === "note") return "note";
  if (group.keyKind === "keyword") return "narration";
  return "payee";
}
