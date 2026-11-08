import type { Category, ImportJobRow } from "@/data/schema";
import { dayKey } from "@/lib/money";
import { groupRowsForReview, type ReviewGroup } from "./group";
import { applyHeuristics, normalizeNoteKey } from "./heuristics";
import { detectRecurring, propagateRecurringCategories } from "./recurrence";
import type { MappedImportRow } from "./types";

export function buildTeachGroups(rows: ImportJobRow[], categories: Category[]): ReviewGroup[] {
  const initialRows = rows.map((row, occurrence_index): MappedImportRow => {
    const narration = row.narration ?? row.descriptor;
    const heuristic = applyHeuristics({ narration, type: row.type, note: row.note });
    const categoryName = categories.find(
      (category) => category.id === row.suggested_category_id,
    )?.name;
    return {
      id: row.id,
      occurred_on: dayKey(row.occurred_at),
      occurred_at: row.occurred_at,
      payee: row.payee || row.descriptor || "Unknown payee",
      narration,
      descriptor: row.descriptor,
      note: row.note,
      note_key: normalizeNoteKey(row.note),
      matched_on:
        categoryName && categoryName === heuristic.suggested_category_name
          ? heuristic.matched_on
          : null,
      amount_paise: row.type === "income" ? row.amount_paise : -row.amount_paise,
      type: row.type,
      import_hash: row.import_hash,
      occurrence_index,
      suggested_category_name: categoryName ?? null,
      confidence: row.confidence ?? heuristic.confidence,
    };
  });
  const recurrenceShapes = detectRecurring(initialRows);
  const mappedRows = propagateRecurringCategories(initialRows, recurrenceShapes);
  return groupRowsForReview(mappedRows, { recurrenceShapes });
}
