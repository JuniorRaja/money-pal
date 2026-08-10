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
  return `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${Math.abs(value).toFixed(digits)}%`;
}

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatDay(iso: string) {
  return dayFmt.format(new Date(iso));
}

export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso)).toUpperCase();
}

export function dayKey(iso: string) {
  return iso.slice(0, 10);
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
