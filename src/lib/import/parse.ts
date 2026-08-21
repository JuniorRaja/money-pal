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

export function isPdfFilename(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

/**
 * Detect file type by magic bytes (file signature) rather than extension.
 * Banks sometimes export XLS files with wrong extensions (.csv, .xls for XLSX, etc.)
 */
function detectFileType(bytes: ArrayBuffer): "xls" | "xlsx" | "pdf" | "text" {
  const arr = new Uint8Array(bytes.slice(0, 8));

  // XLS (OLE2 Compound Document): D0 CF 11 E0 A1 B1 1A E1
  if (
    arr[0] === 0xd0 &&
    arr[1] === 0xcf &&
    arr[2] === 0x11 &&
    arr[3] === 0xe0 &&
    arr[4] === 0xa1 &&
    arr[5] === 0xb1 &&
    arr[6] === 0x1a &&
    arr[7] === 0xe1
  ) {
    return "xls";
  }

  // XLSX/DOCX/etc (ZIP): 50 4B 03 04 or 50 4B 05 06 or 50 4B 07 08
  if (arr[0] === 0x50 && arr[1] === 0x4b && (arr[2] === 0x03 || arr[2] === 0x05 || arr[2] === 0x07)) {
    return "xlsx";
  }

  // PDF: 25 50 44 46 ("%PDF")
  if (arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46) {
    return "pdf";
  }

  return "text";
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

/**
 * Decode a statement file into a raw `string[][]` grid. PDF text extraction is
 * dynamically imported so pdfjs-dist (worker + all) only loads for users who
 * actually open a PDF, and never enters the SSR module graph.
 */
export async function parseFileToGrid(
  bytes: ArrayBuffer,
  filename: string,
  password?: string,
): Promise<string[][]> {
  // First, detect actual file type by magic bytes - bank exports often have wrong extensions
  const detectedType = detectFileType(bytes);

  // Use content-based detection, falling back to extension if content looks like plain text
  if (detectedType === "pdf" || isPdfFilename(filename)) {
    const { pdfToGrid } = await import("./pdf");
    return pdfToGrid(bytes, password);
  }
  if (detectedType === "xls" || detectedType === "xlsx" || isSpreadsheetFilename(filename)) {
    return gridFromWorkbook(bytes);
  }
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
      note: heuristic.note,
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
  const grid = await parseFileToGrid(toArrayBuffer(bytes), options.filename);
  return parseImportGrid(grid, options);
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
