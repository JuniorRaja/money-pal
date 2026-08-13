/** Local calendar month helpers (YYYY-MM). Avoid UTC `toISOString()` slice. */

export function currentPeriod(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftPeriod(period: string, months: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const d = new Date(y, m - 1 + months, 1);
  return currentPeriod(d);
}

export function periodMonthDate(period: string): string {
  return `${period}-01`;
}

export function formatPeriodLabel(period: string): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function periodPace(
  period: string,
  now = new Date(),
): {
  day: number;
  days: number;
  remainingDays: number;
  expectedBps: number;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
} {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const year = y;
  const month = m;
  const days = new Date(year, month, 0).getDate();
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
  const isPast =
    now.getFullYear() > year || (now.getFullYear() === year && now.getMonth() + 1 > month);
  const isFuture = !isCurrent && !isPast;
  const day = isCurrent ? now.getDate() : isPast ? days : 0;
  const remainingDays = isCurrent ? Math.max(0, days - day) : isPast ? 0 : days;
  const expectedBps = days === 0 ? 0 : Math.round((day / days) * 10000);
  return { day, days, remainingDays, expectedBps, isCurrent, isPast, isFuture };
}
