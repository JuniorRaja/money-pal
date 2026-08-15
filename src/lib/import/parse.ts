import Papa from "papaparse";
import * as XLSX from "xlsx";
import { applyHeuristics } from "./heuristics";
import { mapRawRecord, recordFromRow, validateMapping } from "./map";
import { cellToString, midnightIst } from "./normalize";
import { detectBankPreset, findHeaderRowIndex, guessMapping, mappingFromPreset } from "./presets";
import type {
  BankPresetId,
  ColumnMapping,
  MappedImportRow,
  ParseImportOptions,
  StatementParseResult,
} from "./types";
import { PREVIEW_ROW_COUNT } from "./types";

export function isSpreadsheetFilename(filename: string): boolean {
  return /\.xlsx?$/i.test(filename);
}

function gridFromCsv(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text, {
    delimiter: "",
    skipEmptyLines: false,
    transform: (value) => cellToString(value),
  });
  return (parsed.data ?? []).map((row) => row.map((cell) => cell ?? ""));
}

function gridFromWorkbook(bytes: ArrayBuffer): string[][] {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });
  return aoa.map((row) => row.map((cell) => cellToString(cell)));
}

function decodeText(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("\uFFFD")) {
    return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  }
  return utf8;
}

export function parseFileToGrid(bytes: ArrayBuffer, filename: string): string[][] {
  if (isSpreadsheetFilename(filename)) return gridFromWorkbook(bytes);
  return gridFromCsv(decodeText(bytes));
}

function resolveMapping(
  headers: string[],
  options: Pick<ParseImportOptions, "preset" | "mapping">,
): { mapping: ColumnMapping; detectedPreset: BankPresetId | null } {
  if (options.mapping) {
    return {
      mapping: options.mapping,
      detectedPreset: options.preset ?? detectBankPreset(headers),
    };
  }

  const requested = options.preset;
  if (requested && requested !== "custom") {
    return { mapping: mappingFromPreset(headers, requested), detectedPreset: requested };
  }

  const detected = detectBankPreset(headers);
  if (detected) {
    return { mapping: mappingFromPreset(headers, detected), detectedPreset: detected };
  }

  return {
    mapping: guessMapping(headers),
    detectedPreset: requested === "custom" ? "custom" : null,
  };
}

function buildMappedRows(
  staged: Array<{
    date: string;
    narration: string;
    amount_paise: number;
    type: "income" | "expense";
  }>,
): MappedImportRow[] {
  return staged.map((row, index) => {
    const heuristic = applyHeuristics({ narration: row.narration, type: row.type });
    return {
      occurred_on: row.date,
      occurred_at: midnightIst(row.date),
      merchant: heuristic.merchant,
      descriptor: row.narration,
      amount_paise: row.amount_paise,
      type: row.type,
      import_hash: "",
      occurrence_index: index,
      suggested_category_name: heuristic.suggested_category_name,
      confidence: heuristic.confidence,
    };
  });
}

/**
 * Parse a CSV/Excel statement entirely in memory. The raw file is never uploaded.
 */
function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof Uint8Array) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return bytes;
}

/**
 * Map an already-decoded grid. Split out from `parseImportBuffer` so the wizard
 * can re-map on every column change without re-decoding the file each time.
 */
export function parseImportGrid(
  grid: readonly (readonly string[])[],
  options: ParseImportOptions,
): StatementParseResult {
  const headerRowIndex = findHeaderRowIndex(grid, options.preset);
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = headerRow.map((h, i) => h || `Column ${i + 1}`);

  const { mapping, detectedPreset } = resolveMapping(headers, options);
  const mappingErrors = validateMapping(mapping, headers);

  const dataRows = grid.slice(headerRowIndex + 1);
  const previewRows = dataRows
    .filter((row) => row.some((c) => c.trim()))
    .slice(0, PREVIEW_ROW_COUNT)
    .map((row) => [...row]);

  if (mappingErrors.length) {
    return {
      filename: options.filename,
      headers,
      headerRowIndex,
      previewRows,
      detectedPreset,
      mapping,
      mappingErrors,
      rows: [],
      skippedRowCount: dataRows.length,
    };
  }

  const staged: Array<{
    date: string;
    narration: string;
    amount_paise: number;
    type: "income" | "expense";
  }> = [];
  let skippedRowCount = 0;

  for (const cells of dataRows) {
    if (!cells.some((c) => c.trim())) {
      skippedRowCount += 1;
      continue;
    }
    const raw = recordFromRow(headers, cells);
    const mapped = mapRawRecord(raw, mapping);
    if (!mapped) {
      skippedRowCount += 1;
      continue;
    }
    staged.push({
      date: mapped.date,
      narration: mapped.narration,
      amount_paise: mapped.amount.amount_paise,
      type: mapped.amount.type,
    });
  }

  // Hashes stay empty here: they are account-scoped, and the account is only
  // known once the user picks one. `attachHashesToRows` fills them in.
  const mapped = buildMappedRows(staged);

  return {
    filename: options.filename,
    headers,
    headerRowIndex,
    previewRows,
    detectedPreset,
    mapping,
    mappingErrors,
    rows: mapped,
    skippedRowCount,
  };
}

export async function parseImportBuffer(
  bytes: ArrayBuffer | Uint8Array,
  options: ParseImportOptions,
): Promise<StatementParseResult> {
  return parseImportGrid(parseFileToGrid(toArrayBuffer(bytes), options.filename), options);
}

export async function parseImportText(
  text: string,
  options: ParseImportOptions,
): Promise<StatementParseResult> {
  const filename = options.filename.toLowerCase().endsWith(".csv")
    ? options.filename
    : `${options.filename}.csv`;
  return parseImportBuffer(new TextEncoder().encode(text), { ...options, filename });
}
