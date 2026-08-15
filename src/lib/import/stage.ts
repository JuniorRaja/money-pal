import type { Category, ImportMapping, ImportRule } from "@/data/schema";
import type {
  BankPresetId,
  ColumnMapping,
  DateFormatHint,
  MappedImportRow,
  UnsignedAmountMeans,
} from "./types";
import { BANK_PRESETS } from "./presets";

const DATE_FORMATS: readonly DateFormatHint[] = ["auto", "DMY", "YMD", "MDY"];
const UNSIGNED: readonly UnsignedAmountMeans[] = ["signed", "expense", "income"];

export function bankPresetLabel(id: BankPresetId): string {
  if (id === "custom") return "Custom mapping";
  return BANK_PRESETS[id].label;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function asColumnMapping(raw: unknown): ColumnMapping | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const dateColumn = asString(row["dateColumn"]);
  const descriptionColumn = asString(row["descriptionColumn"]);
  if (!dateColumn || !descriptionColumn) return null;
  const dateFormat = DATE_FORMATS.includes(row["dateFormat"] as DateFormatHint)
    ? (row["dateFormat"] as DateFormatHint)
    : "auto";
  const unsignedAmountMeans = UNSIGNED.includes(row["unsignedAmountMeans"] as UnsignedAmountMeans)
    ? (row["unsignedAmountMeans"] as UnsignedAmountMeans)
    : "signed";
  return {
    dateColumn,
    descriptionColumn,
    amountColumn: asNullableString(row["amountColumn"]),
    debitColumn: asNullableString(row["debitColumn"]),
    creditColumn: asNullableString(row["creditColumn"]),
    crDrColumn: asNullableString(row["crDrColumn"]),
    balanceColumn: asNullableString(row["balanceColumn"]),
    dateFormat,
    unsignedAmountMeans,
  };
}

export function categoryIdByName(
  categories: Category[],
  name: string | null | undefined,
): string | null {
  if (!name?.trim()) return null;
  const needle = name.trim().toLowerCase();
  return categories.find((category) => category.name.toLowerCase() === needle)?.id ?? null;
}

/**
 * Account-scoped rules win over global. Match is a lowercase substring of the
 * merchant. Paused rules (`is_active` off in Settings) are skipped here — the
 * one place every caller routes through.
 */
export function findImportRule(
  merchant: string,
  rules: ImportRule[],
  accountId: string,
): ImportRule | null {
  const haystack = merchant.trim().toLowerCase();
  if (!haystack) return null;
  const active = rules.filter((rule) => rule.is_active);
  const scoped = active.filter((rule) => rule.account_id === accountId);
  const global = active.filter((rule) => rule.account_id == null);
  for (const rule of [...scoped, ...global]) {
    if (haystack.includes(rule.match.toLowerCase())) return rule;
  }
  return null;
}

export function applyImportRules(
  merchant: string,
  rules: ImportRule[],
  accountId: string,
): string | null {
  return findImportRule(merchant, rules, accountId)?.category_id ?? null;
}

export function resolveSuggestedCategoryId(input: {
  merchant: string;
  suggestedCategoryName?: string | null;
  suggestedCategoryId?: string | null;
  categories: Category[];
  rules: ImportRule[];
  accountId: string;
}): string | null {
  return (
    applyImportRules(input.merchant, input.rules, input.accountId) ??
    input.suggestedCategoryId ??
    categoryIdByName(input.categories, input.suggestedCategoryName)
  );
}

export function toStageDrafts(
  rows: MappedImportRow[],
  categories: Category[],
  rules: ImportRule[],
  accountId: string,
): Array<{
  occurred_at: string;
  merchant: string;
  descriptor: string;
  note: string | null;
  amount_paise: number;
  type: "income" | "expense";
  raw_line: ImportMapping;
  import_hash: string;
  suggested_category_id: string | null;
  confidence: number;
}> {
  return rows
    .filter((row) => Math.abs(row.amount_paise) > 0 && row.import_hash)
    .map((row) => {
      const fromRule = applyImportRules(row.merchant, rules, accountId);
      const fromName = categoryIdByName(categories, row.suggested_category_name);
      return {
        occurred_at: row.occurred_at,
        merchant: row.merchant,
        descriptor: row.descriptor,
        note: row.note,
        amount_paise: Math.abs(row.amount_paise),
        type: row.type,
        raw_line: {},
        import_hash: row.import_hash,
        suggested_category_id: fromRule ?? fromName,
        confidence: fromRule ? Math.max(row.confidence, 0.9) : row.confidence,
      };
    });
}
