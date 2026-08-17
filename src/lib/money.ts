import type { Paise } from "@/data/schema";

const indian = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const indianWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rupees(value: Paise): number {
  return value / 100;
}

export function formatMoney(value: Paise, opts: { whole?: boolean; sign?: boolean } = {}) {
  const abs = Math.abs(value) / 100;
  const body = opts.whole ? indianWhole.format(abs) : indian.format(abs);
  const prefix = opts.sign ? (value < 0 ? "-" : "+") : value < 0 ? "-" : "";
  return `${prefix}\u20B9${body}`;
}

export function formatCompact(value: Paise) {
  const abs = Math.abs(value) / 100;
  if (abs >= 1e7) return `\u20B9${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `\u20B9${(abs / 1e5).toFixed(2)} L`;
  return `\u20B9${indianWhole.format(abs)}`;
}

export function formatPct(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
  // A near-zero baseline makes the ratio explode (\u20b91 \u2192 \u20b91,00,000 is +9,999,900%).
  // The number stops meaning anything long before it stops fitting the card.
  if (Math.abs(value) >= 1000) return `${sign}999%+`;
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/**
 * A percentage-point gap \u2014 "+3.2 pp". Deliberately not `formatPct`: a savings
 * rate moving 40% \u2192 43% is +3 points, not +7.5%, and the two must not look alike.
 */
export function formatPoints(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(value).toFixed(digits)} pp`;
}

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});
// en-CA renders as YYYY-MM-DD, which is the key format the app stores and compares.
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function formatDay(iso: string) {
  return dayFmt.format(new Date(iso));
}

export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso)).toUpperCase();
}

/**
 * "YYYY-MM-DD" for the IST calendar day an instant falls on. Never slice the raw
 * string: Postgres hands back midnight IST as "…T18:30:00+00:00", so a prefix
 * slice yields the previous day.
 */
export function dayKey(iso: string) {
  return dayKeyFmt.format(new Date(iso));
}

/** "Today" / "Yesterday" / "Sat" relative to the app's fixed demo clock. */
export function relativeDayLabel(isoDay: string, today: string) {
  const a = new Date(`${isoDay}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  const diff = Math.round((b - a) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(new Date(a));
}
