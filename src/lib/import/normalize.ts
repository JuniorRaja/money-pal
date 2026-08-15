import type { Paise } from "@/data/schema";
import type { DateFormatHint } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeNarration(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${value.getFullYear()}`;
  }
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim();
}

/** Parse an INR amount string (Indian grouping, Dr/Cr suffix, parentheses) to paise. */
export function parseAmountToPaise(raw: string): Paise | null {
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (!s || s === "-" || s === "—" || s === "–") return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  const suffix = s.match(/\s*(cr|dr|credit|debit)$/i);
  if (suffix) {
    const tag = suffix[1]?.toLowerCase() ?? "";
    if (tag === "dr" || tag === "debit") negative = true;
    s = s.slice(0, s.length - suffix[0].length).trim();
  }

  if (s.startsWith("-") || s.startsWith("+")) {
    if (s.startsWith("-")) negative = true;
    s = s.slice(1).trim();
  }

  s = s.replace(/[₹rs\s]/gi, "").replace(/,/g, "");
  if (!s) return 0;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  const paise = Math.round(n * 100);
  return negative ? -paise : paise;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidYmd(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

/**
 * Parse a statement date to YYYY-MM-DD.
 * Indian statements default to DMY when the date is ambiguous.
 */
export function parseStatementDate(raw: string, format: DateFormatHint = "auto"): string | null {
  const s = raw.replace(/^\uFEFF/, "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const named = s.match(/^(\d{1,2})[/\-\s]+([A-Za-z]{3,})[/\-\s,]+(\d{2,4})$/);
  if (named) {
    const month = MONTHS[named[2]?.toLowerCase() ?? ""];
    if (!month) return null;
    return toIsoDate(expandYear(Number(named[3])), month, Number(named[1]));
  }

  const namedFirst = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (namedFirst) {
    const month = MONTHS[namedFirst[1]?.toLowerCase() ?? ""];
    if (!month) return null;
    return toIsoDate(expandYear(Number(namedFirst[3])), month, Number(namedFirst[2]));
  }

  const numeric = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!numeric) return null;

  const a = Number(numeric[1]);
  const b = Number(numeric[2]);
  const year = expandYear(Number(numeric[3]));

  let day = a;
  let month = b;
  const hint = format === "auto" ? inferNumericOrder(a, b) : format;
  if (hint === "MDY") {
    month = a;
    day = b;
  } else if (hint === "YMD") {
    return null;
  }

  return toIsoDate(year, month, day);
}

function inferNumericOrder(a: number, b: number): DateFormatHint {
  if (a > 12 && b <= 12) return "DMY";
  if (b > 12 && a <= 12) return "MDY";
  return "DMY";
}

export function midnightIst(isoDate: string): string {
  return `${isoDate}T00:00:00+05:30`;
}

export function lookUpColumn(
  headers: readonly string[],
  aliases: readonly string[],
): string | null {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  for (const header of headers) {
    if (aliasSet.has(normalizeHeader(header))) return header;
  }
  return null;
}
