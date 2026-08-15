import type { ISODate, ISODateTime, Paise, TransactionType } from "@/data/schema";

export type BankPresetId = "hdfc_savings" | "hdfc_cc" | "dbs" | "custom";

export type DateFormatHint = "auto" | "DMY" | "YMD" | "MDY";

/**
 * How a single amount column should be interpreted when debit/credit
 * columns are not both present.
 * - signed: negative = money out
 * - expense: unsigned (or absolute) amounts are expenses unless a Cr/Dr column says otherwise
 * - income: unsigned amounts are income unless a Cr/Dr column says otherwise
 */
export type UnsignedAmountMeans = "signed" | "expense" | "income";

/**
 * Persisted column mapping (JSON for `import_profiles.mapping`).
 * Headers are the original sheet labels, not normalized keys.
 */
export type ColumnMapping = {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn: string | null;
  debitColumn: string | null;
  creditColumn: string | null;
  crDrColumn: string | null;
  balanceColumn: string | null;
  dateFormat: DateFormatHint;
  unsignedAmountMeans: UnsignedAmountMeans;
};

export type BankPreset = {
  id: Exclude<BankPresetId, "custom">;
  label: string;
  dateFormat: DateFormatHint;
  unsignedAmountMeans: UnsignedAmountMeans;
  dateAliases: readonly string[];
  descriptionAliases: readonly string[];
  debitAliases: readonly string[];
  creditAliases: readonly string[];
  amountAliases: readonly string[];
  crDrAliases: readonly string[];
  balanceAliases: readonly string[];
};

export type MappedImportRow = {
  occurred_on: ISODate;
  occurred_at: ISODateTime;
  merchant: string;
  descriptor: string;
  /** Trailing free text you typed at payment time, when the narration has one. */
  note: string | null;
  /** Signed paise: negative = money out (matches `Transaction.amount`). */
  amount_paise: Paise;
  type: Exclude<TransactionType, "transfer">;
  /** Empty until `attachHashesToRows` runs — the hash needs the destination account. */
  import_hash: string;
  occurrence_index: number;
  suggested_category_name: string | null;
  confidence: number;
};

export type StatementParseResult = {
  filename: string;
  headers: string[];
  headerRowIndex: number;
  previewRows: string[][];
  detectedPreset: BankPresetId | null;
  mapping: ColumnMapping | null;
  mappingErrors: string[];
  rows: MappedImportRow[];
  skippedRowCount: number;
};

export type ParseImportOptions = {
  filename: string;
  preset?: BankPresetId | undefined;
  mapping?: ColumnMapping | undefined;
};

export type HeuristicSuggestion = {
  merchant: string;
  note: string | null;
  suggested_category_name: string | null;
  confidence: number;
};

export const PREVIEW_ROW_COUNT = 8;
