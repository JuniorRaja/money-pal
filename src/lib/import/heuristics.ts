import type { HeuristicSuggestion } from "./types";
import { normalizeNarration } from "./normalize";

type KeywordRule = {
  category: string;
  keywords: readonly string[];
  /** When set, only apply if the row type matches. */
  type?: "income" | "expense";
  confidence: number;
};

/**
 * Keyword → global category **name** (see seed categories).
 * UI/data-layer should resolve name → category_id for the current user.
 */
const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    category: "Salary",
    type: "income",
    confidence: 0.92,
    keywords: ["SALARY", "PAYROLL", "MONTHLY PAY"],
  },
  {
    category: "Interest",
    type: "income",
    confidence: 0.88,
    keywords: ["INT.PD", "INTEREST CREDIT", "SB INT", "INTEREST PAID"],
  },
  {
    category: "Dining",
    type: "expense",
    confidence: 0.86,
    keywords: [
      "SWIGGY",
      "ZOMATO",
      "EATSURE",
      "DOMINOS",
      "DOMINO'S",
      "PIZZA HUT",
      "STARBUCKS",
      "CAFE COFFEE",
      "BURGER KING",
      "MCDONALD",
      "KFC",
      "BARBEQUE",
      "EATCLUB",
      "MAGICPIN",
    ],
  },
  {
    category: "Groceries",
    type: "expense",
    confidence: 0.86,
    keywords: [
      "BIGBASKET",
      "BLINKIT",
      "ZEPTO",
      "INSTAMART",
      "DMART",
      "D-MART",
      "RELIANCE FRESH",
      "NATURES BASKET",
    ],
  },
  {
    category: "Transport",
    type: "expense",
    confidence: 0.84,
    keywords: [
      "UBER",
      "OLA ",
      "OLA-",
      "/OLA/",
      "RAPIDO",
      "IRCTC",
      "FASTAG",
      "HPCL",
      "BPCL",
      "IOCL",
      "PETROL",
      "PARK+",
    ],
  },
  {
    category: "Shopping",
    type: "expense",
    confidence: 0.84,
    keywords: ["AMAZON", "FLIPKART", "MYNTRA", "AJIO", "NYKAA", "MEESHO", "CROMA"],
  },
  {
    category: "Entertainment",
    type: "expense",
    confidence: 0.84,
    keywords: [
      "NETFLIX",
      "SPOTIFY",
      "HOTSTAR",
      "PRIME VIDEO",
      "YOUTUBE",
      "BOOKMYSHOW",
      "PVR",
      "INOX",
      "SONY LIV",
    ],
  },
  {
    category: "Utilities",
    type: "expense",
    confidence: 0.8,
    keywords: [
      "AIRTEL",
      "JIO",
      "BSNL",
      "TATASKY",
      "ACT FIBERNET",
      "BESCOM",
      "MSEDCL",
      "ELECTRICITY",
    ],
  },
  {
    category: "Healthcare",
    type: "expense",
    confidence: 0.82,
    keywords: ["PHARMEASY", "NETMEDS", "APOLLO", "1MG", "PRACTO"],
  },
  {
    category: "Travel",
    type: "expense",
    confidence: 0.82,
    keywords: [
      "MAKEMYTRIP",
      "GOIBIBO",
      "CLEARTRIP",
      "INDIGO",
      "AIR INDIA",
      "SPICEJET",
      "AIRBNB",
      "BOOKING.COM",
    ],
  },
  {
    category: "Investments",
    type: "expense",
    confidence: 0.8,
    keywords: ["GROWW", "ZERODHA", "UPSTOX", "KUVERA", "MF UTILITY", "CAMS", "KFINTECH"],
  },
  {
    category: "EMI",
    type: "expense",
    confidence: 0.8,
    keywords: ["LOAN EMI", "BILLDESK EMI", "EMI "],
  },
];

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

export function applyHeuristics(input: {
  narration: string;
  type: "income" | "expense";
}): HeuristicSuggestion {
  const haystack = normalizeNarration(input.narration);
  const merchant = extractMerchant(input.narration);
  const note = extractNote(input.narration);
  const hit = matchRule(haystack, input.type);

  if (hit) {
    return {
      merchant: merchant || hit.category,
      note,
      suggested_category_name: hit.category,
      confidence: hit.confidence,
    };
  }

  if (merchant && merchant.length >= 3) {
    return {
      merchant,
      note,
      suggested_category_name: null,
      confidence: 0.4,
    };
  }

  return {
    merchant: merchant || input.narration.trim().slice(0, 48),
    note,
    suggested_category_name: null,
    confidence: 0.2,
  };
}
