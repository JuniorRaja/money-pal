import type { MappedImportRow } from "./types";
import { normalizeNarration } from "./normalize";

export type RecurrenceShape = {
  key: string;
  keyKind: "note" | "payee";
  type: "income" | "expense";
  occurrenceIndexes: number[];
  cadence: "monthly" | "irregular";
  amountStability: "exact" | "near" | "variable";
  humanRound: boolean;
  magnitude: "small" | "medium" | "large";
};

type RowGroup = {
  key: string;
  keyKind: RecurrenceShape["keyKind"];
  type: RecurrenceShape["type"];
  rows: MappedImportRow[];
  totalPaise: number;
};

function amountStability(rows: readonly MappedImportRow[]): RecurrenceShape["amountStability"] {
  const amounts = rows.map((row) => Math.abs(row.amount_paise));
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (min === max) return "exact";
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  return (max - min) / average <= 0.02 ? "near" : "variable";
}

function isHumanRound(rows: readonly MappedImportRow[]): boolean {
  const average = rows.reduce((sum, row) => sum + Math.abs(row.amount_paise), 0) / rows.length;
  const nearest500Rupees = Math.round(average / 50_000) * 50_000;
  if (nearest500Rupees === 0) return false;
  return Math.abs(average - nearest500Rupees) / nearest500Rupees <= 0.01;
}

function cadence(rows: readonly MappedImportRow[]): RecurrenceShape["cadence"] {
  const dates = rows
    .map((row) => Date.parse(`${row.occurred_on}T00:00:00Z`))
    .sort((left, right) => left - right);
  for (let index = 1; index < dates.length; index += 1) {
    const days = (dates[index]! - dates[index - 1]!) / 86_400_000;
    if (days < 25 || days > 35) return "irregular";
  }
  return "monthly";
}

function magnitudeBuckets(groups: readonly RowGroup[]): Map<string, RecurrenceShape["magnitude"]> {
  const sorted = [...groups].sort((left, right) => left.totalPaise - right.totalPaise);
  const buckets = new Map<string, RecurrenceShape["magnitude"]>();
  sorted.forEach((group, index) => {
    const percentile = (index + 1) / sorted.length;
    buckets.set(
      `${group.type}:${group.keyKind}:${group.key}`,
      percentile <= 1 / 3 ? "small" : percentile <= 2 / 3 ? "medium" : "large",
    );
  });
  return buckets;
}

/** Detects repeated payment shape only; it never assigns or suggests a category. */
export function detectRecurring(rows: readonly MappedImportRow[]): RecurrenceShape[] {
  const groups = new Map<string, RowGroup>();
  for (const row of rows) {
    const noteKey = row.note_key?.trim();
    const keyKind = noteKey ? "note" : "payee";
    const key = noteKey ? normalizeNarration(noteKey) : normalizeNarration(row.payee);
    if (!key) continue;
    const groupId = `${row.type}:${keyKind}:${key}`;
    const group = groups.get(groupId) ?? { key, keyKind, type: row.type, rows: [], totalPaise: 0 };
    group.rows.push(row);
    group.totalPaise += Math.abs(row.amount_paise);
    groups.set(groupId, group);
  }

  const magnitudes = magnitudeBuckets([...groups.values()]);
  return [...groups.entries()]
    .filter(([, group]) => group.rows.length >= 2)
    .map(([groupId, group]) => ({
      key: group.key,
      keyKind: group.keyKind,
      type: group.type,
      occurrenceIndexes: group.rows.map((row) => row.occurrence_index),
      cadence: cadence(group.rows),
      amountStability: amountStability(group.rows),
      humanRound: isHumanRound(group.rows),
      magnitude: magnitudes.get(groupId) ?? "small",
    }));
}

/** Copies a resolved heuristic or explicit user choice across its recurrence group. */
export function propagateRecurringCategories(
  rows: readonly MappedImportRow[],
  shapes: readonly RecurrenceShape[],
  approvedCategories: ReadonlyMap<number, string> = new Map(),
): MappedImportRow[] {
  const rowsByIndex = new Map(rows.map((row) => [row.occurrence_index, row]));
  const assignments = new Map<number, { category: string; confidence: number }>();

  for (const shape of shapes) {
    const groupRows = shape.occurrenceIndexes
      .map((index) => rowsByIndex.get(index))
      .filter((row): row is MappedImportRow => row !== undefined);
    const approved = shape.occurrenceIndexes
      .map((index) => approvedCategories.get(index))
      .find((category): category is string => Boolean(category));
    const suggestion = groupRows.find((row) => row.suggested_category_name && row.matched_on);
    const category = approved ?? suggestion?.suggested_category_name;
    if (!category) continue;

    for (const row of groupRows) {
      if (row.suggested_category_name) continue;
      assignments.set(row.occurrence_index, {
        category,
        confidence: approved ? 1 : (suggestion?.confidence ?? row.confidence),
      });
    }
  }

  return rows.map((row) => {
    const assignment = assignments.get(row.occurrence_index);
    return assignment
      ? {
          ...row,
          suggested_category_name: assignment.category,
          matched_on: null,
          confidence: assignment.confidence,
        }
      : row;
  });
}
