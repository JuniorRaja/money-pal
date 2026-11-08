import type { HeuristicSuggestion } from "./types";
import { normalizeNarration } from "./normalize";
import { KEYWORD_RULES } from "./keywords";

/** Payment rails that prefix Indian narration but never name a merchant. */
const RAIL_PREFIX = /^(?:UPI|NEFT|IMPS|ACH|POS|ATM|RTGS|MMT|CMS|P2P|P2A|PCD|INF)\b[\s.:-]*/i;

function cleanMerchantToken(raw: string): string {
  const words = raw
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    // Reference numbers ride along in nearly every narration and are never a
    // merchant — "IMPS P2P 622157719873#09" contains no name at all.
    .filter((word) => !/\d{5,}/.test(word) && !/^[#*\d]+$/.test(word));

  let out = words.join(" ").trim();
  // Stacked rails are common ("UPI-IMPS-..."), so strip until none is left.
  while (RAIL_PREFIX.test(out)) out = out.replace(RAIL_PREFIX, "").trim();
  return out;
}

/**
 * Pull a human merchant from Indian bank narration (UPI / NEFT / IMPS / POS).
 * Does not attempt transfer pairing.
 */
export function extractMerchant(narration: string): string {
  const raw = narration.trim();
  if (!raw) return "";

  const upiHandle = raw.match(
    /\/([A-Za-z][A-Za-z0-9 .&'-]{1,40})@(?:ybl|okaxis|okhdfcbank|oksbi|paytm|apl|ibl|axl)\b/i,
  );
  if (upiHandle?.[1]) return titleCase(cleanMerchantToken(upiHandle[1]));

  // The hyphen must be escaped: `[^/-@]` reads as the range / → @, which
  // excludes every digit and cut "UPI-J AMALIYA COOL BAR-Q3566..." at the "3".
  const upi = raw.match(/\bUPI[-/]([^\-/@]+)/i);
  if (upi?.[1]) return titleCase(cleanMerchantToken(upi[1]));

  const neft = raw.match(/\bNEFT\s*(?:CR|DR)?[- ]+[A-Z]{4}[0-9]+[- ]+([^-]+)/i);
  if (neft?.[1]) return titleCase(cleanMerchantToken(neft[1]));

  const imps = raw.match(/\bIMPS[-/][^/-]*[-/]([^/-]+)/i);
  if (imps?.[1] && !/^\d+$/.test(imps[1])) return titleCase(cleanMerchantToken(imps[1]));

  const pos = raw.match(/\bPOS\s+\d+\s+(.+)$/i);
  if (pos?.[1]) return titleCase(cleanMerchantToken(pos[1].split(/\s{2,}/)[0] ?? pos[1]));

  const first = cleanMerchantToken(raw.split(/[-/,]/)[0] ?? raw);
  if (first.length >= 3 && first.length <= 48) return titleCase(first);

  // Nothing but rails and reference numbers. Returning "" drops confidence to
  // 0.2 and shows the raw narration, which beats presenting a reference number
  // as if it were a merchant name.
  return titleCase(cleanMerchantToken(raw).slice(0, 48));
}

/**
 * Structured tails that end a narration when you typed no note: a reference
 * number, a masked account, a VPA, an IFSC.
 */
const NOT_A_NOTE: readonly RegExp[] = [
  /\d{6,}/, // reference numbers run 10-12 digits
  /@/, // VPA
  /^[A-Z]{4}0[A-Z0-9]{6}$/i, // IFSC, e.g. YESB0YBLUPI
  /^X+\d*$/i, // masked account, e.g. XXXXXXX1893
];

/**
 * Indian bank narration ends with the note typed at payment time — when one was
 * typed: `UPI-M O COOL BAR-Q693365448@YBL-YESB0YBLUPI-192342317477-TEA` → "TEA".
 * It is often absent, so the trailing segment counts as a note only when it
 * doesn't look like one of the structured fields that otherwise ends the string.
 * Returned verbatim: it is your text, and banks upper-case everything anyway.
 */
export function extractNote(narration: string): string | null {
  const parts = narration.trim().split("-");
  // Under 5 fields the tail is still structure (merchant, VPA), not your text.
  if (parts.length < 5) return null;

  const last = (parts.at(-1) ?? "").trim();
  if (last.length < 2 || last.length > 60) return null;
  if (!/[A-Za-z]/.test(last)) return null;
  if (NOT_A_NOTE.some((pattern) => pattern.test(last))) return null;
  return last;
}

function titleCase(value: string): string {
  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return s;
  return s
    .split(" ")
    .map((part) => {
      if (part.length <= 2) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function matchRule(
  haystack: string,
  type: "income" | "expense",
): { category: string; confidence: number } | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.type && rule.type !== type) continue;
    for (const keyword of rule.keywords) {
      if (haystack.includes(keyword)) {
        return { category: rule.category, confidence: rule.confidence };
      }
    }
  }
  return null;
}

export function normalizeNoteKey(note: string | null): string {
  if (!note) return "";
  return note
    .toUpperCase()
    .replace(
      /\b(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\b/g,
      " ",
    )
    .replace(/\b\d+(?:ST|ND|RD|TH)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:!?-]+$/, "")
    .trim();
}

export function applyHeuristics(input: {
  narration: string;
  type: "income" | "expense";
}): HeuristicSuggestion {
  const haystack = normalizeNarration(input.narration);
  const payee = extractMerchant(input.narration);
  const note = extractNote(input.narration);
  const noteKey = normalizeNoteKey(note);
  const noteHit = noteKey ? matchRule(noteKey, input.type) : null;
  const narrationHit = noteHit ? null : matchRule(haystack, input.type);
  const hit = noteHit ?? narrationHit;

  if (hit) {
    return {
      payee: payee || hit.category,
      narration: input.narration,
      note,
      note_key: noteKey || null,
      suggested_category_name: hit.category,
      matched_on: noteHit ? "note" : "narration",
      confidence: noteHit ? Math.min(hit.confidence + 0.06, 0.95) : hit.confidence,
    };
  }

  if (payee && payee.length >= 3) {
    return {
      payee,
      narration: input.narration,
      note,
      note_key: noteKey || null,
      suggested_category_name: null,
      matched_on: null,
      confidence: 0.4,
    };
  }

  return {
    payee: payee || input.narration.trim().slice(0, 48),
    narration: input.narration,
    note,
    note_key: noteKey || null,
    suggested_category_name: null,
    matched_on: null,
    confidence: 0.2,
  };
}
