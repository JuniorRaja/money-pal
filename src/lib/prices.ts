/**
 * P3-4 — market price parsing. Pure: no fetch, no Supabase, so `npm run test:unit`
 * covers it. The I/O lives in `tasks/prices.ts`.
 *
 * The invariant every function here exists to hold: an unparseable or non-positive
 * price returns null and the caller leaves the holding untouched. A zeroed holding
 * silently understates the portfolio; a visibly stale `priced_at` does not.
 */
import type { HoldingClass, Paise } from "@/data/schema";
import { parseAmountToPaise } from "@/lib/import/normalize";

export type PriceFeed = "amfi" | "yahoo";

/**
 * Which feed prices a class. Null means priced by hand — property and fixed
 * income have no source, and crypto is out of scope for P3-4.
 */
export function feedFor(assetClass: HoldingClass): PriceFeed | null {
  switch (assetClass) {
    case "mutual_fund":
      return "amfi";
    // Gold rides the equity path via a tracking ETF (GOLDBEES.NS) rather than
    // earning a second provider.
    case "equity":
    case "gold":
      return "yahoo";
    default:
      return null;
  }
}

export const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export function yahooQuoteUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=1d`;
}

/**
 * Parse AMFI's NAVAll.txt into scheme code → NAV in paise.
 *
 * The file is ~2 MB of semicolon-delimited rows interleaved with fund-house
 * headings, category headings and blank separators, so rows are recognised by
 * shape rather than by position: six fields, a numeric scheme code, a positive
 * NAV. Anything else is a heading and is skipped in silence.
 *
 *   Scheme Code;ISIN Payout;ISIN Reinvest;Scheme Name;Net Asset Value;Date
 *   119551;INF209KB1CQ2;INF209KB1CR0;Some Fund - DIRECT - GROWTH;100.9483;16-Aug-2026
 */
export function parseAmfiNav(text: string): Map<string, Paise> {
  const navs = new Map<string, Paise>();

  for (const line of text.split(/\r?\n/)) {
    const fields = line.split(";");
    if (fields.length < 6) continue;

    const code = fields[0]?.trim() ?? "";
    if (!/^\d+$/.test(code)) continue;

    const nav = parsePrice(fields[4] ?? "");
    if (nav === null) continue;

    navs.set(code, nav);
  }

  return navs;
}

/**
 * Pull the last traded price out of a Yahoo chart response. Unofficial and
 * ToS-grey, so it is assumed to change shape without warning — every hop is
 * guarded and a surprise returns null rather than throwing.
 */
export function parseYahooQuote(json: unknown): Paise | null {
  if (typeof json !== "object" || json === null) return null;

  const chart = (json as { chart?: unknown }).chart;
  if (typeof chart !== "object" || chart === null) return null;

  const results = (chart as { result?: unknown }).result;
  if (!Array.isArray(results) || results.length === 0) return null;

  const meta = (results[0] as { meta?: unknown } | undefined)?.meta;
  if (typeof meta !== "object" || meta === null) return null;

  const price = (meta as { regularMarketPrice?: unknown }).regularMarketPrice;
  if (typeof price !== "number") return null;

  return parsePrice(String(price));
}

/**
 * Rupees → paise at the boundary, rejecting anything that isn't a real price.
 *
 * `parseAmountToPaise` is reused for the decimal handling but is deliberately
 * lenient — it maps "" and "-" to 0, which is correct for a statement cell and
 * catastrophic for a price. Zero and negative are rejected here.
 */
function parsePrice(raw: string): Paise | null {
  const paise = parseAmountToPaise(raw);
  if (paise === null || !Number.isFinite(paise) || paise <= 0) return null;
  return paise;
}
