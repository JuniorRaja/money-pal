import type { BankPreset, BankPresetId, ColumnMapping } from "./types";
import { lookUpColumn, normalizeHeader } from "./normalize";

const DATE_ALIASES = [
  "date",
  "txn date",
  "txn dt",
  "transaction date",
  "tran date",
  "value date",
  "posting date",
] as const;

const DESCRIPTION_ALIASES = [
  "narration",
  "description",
  "transaction description",
  "particulars",
  "remarks",
  "transaction remarks",
  "details",
  "statement",
  "transaction details",
  "merchant",
  "transaction",
] as const;

const DEBIT_ALIASES = [
  "debit amount",
  "debit",
  "withdrawal",
  "withdrawal amt",
  "withdrawals",
  "dr",
  "debit amt",
] as const;

const CREDIT_ALIASES = [
  "credit amount",
  "credit",
  "deposit",
  "deposit amt",
  "deposits",
  "cr",
  "credit amt",
] as const;

const AMOUNT_ALIASES = ["amount", "amount inr", "txn amount", "transaction amount", "amt"] as const;

const CRDR_ALIASES = [
  "credit debit",
  "credit debit indicator",
  "cr dr",
  "dr cr",
  "type",
  "transaction type",
  "debit credit",
] as const;

const BALANCE_ALIASES = [
  "closing balance",
  "balance",
  "account balance",
  "available balance",
  "running balance",
] as const;

export const BANK_PRESETS: Record<Exclude<BankPresetId, "custom">, BankPreset> = {
  hdfc_savings: {
    id: "hdfc_savings",
    label: "HDFC NetBanking (Savings)",
    dateFormat: "DMY",
    unsignedAmountMeans: "signed",
    dateAliases: ["date", "txn date", "transaction date"],
    descriptionAliases: ["narration", "description", "particulars"],
    debitAliases: ["debit amount", "debit", "withdrawal"],
    creditAliases: ["credit amount", "credit", "deposit"],
    amountAliases: [],
    crDrAliases: [],
    balanceAliases: ["closing balance", "balance"],
  },
  hdfc_cc: {
    id: "hdfc_cc",
    label: "HDFC Credit Card",
    dateFormat: "DMY",
    unsignedAmountMeans: "expense",
    dateAliases: ["transaction date", "date", "tran date"],
    descriptionAliases: ["transaction description", "description", "narration"],
    debitAliases: [],
    creditAliases: [],
    amountAliases: ["amount", "amount inr", "amount inrs"],
    crDrAliases: ["credit debit", "credit debit indicator", "cr dr", "type"],
    balanceAliases: [],
  },
  dbs: {
    id: "dbs",
    label: "DBS",
    dateFormat: "auto",
    unsignedAmountMeans: "signed",
    dateAliases: ["transaction date", "txn date", "date"],
    descriptionAliases: ["transaction description", "description", "statement", "particulars"],
    debitAliases: ["debit", "debit amount", "withdrawal"],
    creditAliases: ["credit", "credit amount", "deposit"],
    amountAliases: [],
    crDrAliases: [],
    balanceAliases: ["account balance", "available balance", "balance"],
  },
};

export const BANK_PRESET_IDS: BankPresetId[] = ["hdfc_savings", "hdfc_cc", "dbs", "custom"];

function scorePreset(headers: readonly string[], preset: BankPreset): number {
  const normalized = headers.map(normalizeHeader);
  const has = (aliases: readonly string[]) =>
    aliases.some((alias) => normalized.includes(normalizeHeader(alias)));

  let score = 0;
  if (has(preset.dateAliases)) score += 2;
  if (has(preset.descriptionAliases)) score += 2;
  if (preset.debitAliases.length && has(preset.debitAliases) && has(preset.creditAliases))
    score += 3;
  if (preset.amountAliases.length && has(preset.amountAliases)) score += 2;
  if (preset.crDrAliases.length && has(preset.crDrAliases)) score += 1;
  if (preset.balanceAliases.length && has(preset.balanceAliases)) score += 1;
  return score;
}

/** Best matching first-class preset, or null if headers do not look like a known bank layout. */
export function detectBankPreset(
  headers: readonly string[],
): Exclude<BankPresetId, "custom"> | null {
  let best: Exclude<BankPresetId, "custom"> | null = null;
  let bestScore = 0;
  for (const id of ["hdfc_savings", "hdfc_cc", "dbs"] as const) {
    const score = scorePreset(headers, BANK_PRESETS[id]);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  // Require date + description plus an amount direction signal.
  if (bestScore < 6) return null;
  return best;
}

export function mappingFromPreset(
  headers: readonly string[],
  presetId: Exclude<BankPresetId, "custom">,
): ColumnMapping {
  const preset = BANK_PRESETS[presetId];
  return {
    dateColumn:
      lookUpColumn(headers, preset.dateAliases) ?? lookUpColumn(headers, DATE_ALIASES) ?? "",
    descriptionColumn:
      lookUpColumn(headers, preset.descriptionAliases) ??
      lookUpColumn(headers, DESCRIPTION_ALIASES) ??
      "",
    amountColumn: lookUpColumn(
      headers,
      preset.amountAliases.length ? preset.amountAliases : AMOUNT_ALIASES,
    ),
    debitColumn: lookUpColumn(
      headers,
      preset.debitAliases.length ? preset.debitAliases : DEBIT_ALIASES,
    ),
    creditColumn: lookUpColumn(
      headers,
      preset.creditAliases.length ? preset.creditAliases : CREDIT_ALIASES,
    ),
    crDrColumn: lookUpColumn(
      headers,
      preset.crDrAliases.length ? preset.crDrAliases : CRDR_ALIASES,
    ),
    balanceColumn: lookUpColumn(
      headers,
      preset.balanceAliases.length ? preset.balanceAliases : BALANCE_ALIASES,
    ),
    dateFormat: preset.dateFormat,
    unsignedAmountMeans: preset.unsignedAmountMeans,
  };
}

/** Guess a custom mapping from header labels when no preset matches. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  return {
    dateColumn: lookUpColumn(headers, DATE_ALIASES) ?? "",
    descriptionColumn: lookUpColumn(headers, DESCRIPTION_ALIASES) ?? "",
    amountColumn: lookUpColumn(headers, AMOUNT_ALIASES),
    debitColumn: lookUpColumn(headers, DEBIT_ALIASES),
    creditColumn: lookUpColumn(headers, CREDIT_ALIASES),
    crDrColumn: lookUpColumn(headers, CRDR_ALIASES),
    balanceColumn: lookUpColumn(headers, BALANCE_ALIASES),
    dateFormat: "auto",
    unsignedAmountMeans: "signed",
  };
}

export function rowLooksLikeHeader(cells: readonly string[], preset?: BankPreset): boolean {
  const aliases = preset
    ? [
      ...preset.dateAliases,
      ...preset.descriptionAliases,
      ...preset.debitAliases,
      ...preset.creditAliases,
      ...preset.amountAliases,
      ...preset.crDrAliases,
    ]
    : [
      ...DATE_ALIASES,
      ...DESCRIPTION_ALIASES,
      ...DEBIT_ALIASES,
      ...CREDIT_ALIASES,
      ...AMOUNT_ALIASES,
    ];

  const aliasSet = new Set(aliases.map(normalizeHeader));
  let hits = 0;
  let hasDate = false;
  let hasDesc = false;
  for (const cell of cells) {
    const n = normalizeHeader(cell);
    if (!n) continue;
    if (aliasSet.has(n)) hits += 1;
    if ((preset?.dateAliases ?? DATE_ALIASES).map(normalizeHeader).includes(n)) hasDate = true;
    if ((preset?.descriptionAliases ?? DESCRIPTION_ALIASES).map(normalizeHeader).includes(n))
      hasDesc = true;
  }
  return hasDate && hasDesc && hits >= 3;
}

export function findHeaderRowIndex(
  grid: readonly (readonly string[])[],
  presetId?: BankPresetId,
): number {
  const preset = presetId && presetId !== "custom" ? BANK_PRESETS[presetId] : undefined;
  const limit = Math.min(grid.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const row = grid[i];
    if (row && rowLooksLikeHeader(row, preset)) return i;
  }
  if (!preset) return 0;
  for (let i = 0; i < limit; i += 1) {
    const row = grid[i];
    if (row && rowLooksLikeHeader(row)) return i;
  }
  return 0;
}
