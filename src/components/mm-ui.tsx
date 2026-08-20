import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { MaskedText } from "@/components/masked-text";
import { cn } from "@/lib/utils";
import { formatPct, formatPoints } from "@/lib/money";

export function Panel({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rise grain overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_0_var(--color-border)]",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          {title && <h2 className="text-base text-foreground">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaUnit = "pct",
  deltaTone = "up-good",
  icon,
  className,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  /** Null means "no honest comparison available" — the row simply stays empty. */
  delta?: number | null | undefined;
  /** `pp` for a gap between two rates; `pct` for a relative change. */
  deltaUnit?: "pct" | "pp";
  /** `down-good` inverts the colours — less debt is a win. */
  deltaTone?: "up-good" | "down-good";
  icon?: ReactNode;
  className?: string;
}) {
  const tone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : (deltaTone === "down-good" ? delta < 0 : delta > 0)
        ? "text-success"
        : "text-destructive";
  return (
    <div
      className={cn("card-lift rise grain rounded-2xl border border-border bg-card p-5", className)}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
      </div>
      <p className="numeric maskable mt-3 text-[28px] leading-none text-foreground">
        <MaskedText>{value}</MaskedText>
      </p>
      <div className="mt-3 flex h-4 items-center gap-2 text-xs">
        {delta != null && (
          <span className={cn("numeric", tone)}>
            {deltaUnit === "pp" ? formatPoints(delta) : formatPct(delta)}
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

/** Tiny inline sparkline that draws itself in on mount. */
export function Sparkline({
  points,
  className,
  tone = "success",
  width = 120,
  height = 36,
}: {
  points: number[];
  className?: string;
  tone?: "success" | "destructive" | "primary";
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / span) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    tone === "success"
      ? "var(--color-success)"
      : tone === "destructive"
        ? "var(--color-destructive)"
        : "var(--color-primary)";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 1200,
          animation: "draw-line 1.4s cubic-bezier(.22,1,.36,1) forwards",
        }}
      />
    </svg>
  );
}

export function Ring({
  value,
  size = 56,
  label,
  tone = "primary",
}: {
  value: number; // 0..100
  size?: number;
  label?: string;
  tone?: "primary" | "success" | "destructive";
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const stroke =
    tone === "success"
      ? "var(--color-success)"
      : tone === "destructive"
        ? "var(--color-destructive)"
        : "var(--color-primary)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="4"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (Math.min(value, 100) / 100) * c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)" }}
      />
      {label && (
        <text
          x="50%"
          y="53%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="numeric fill-foreground"
          style={{ fontSize: size / 4.6 }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

export function Bar({ value, tone = "primary" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: `var(--color-${tone})` }}
      />
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Dot({ token }: { token: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: `var(--color-${token})` }}
    />
  );
}

/**
 * Segmented bar showing how an account balance splits across its slices, with
 * the leftover shown as a muted "Unallocated" tail.
 */
export function SliceBar({
  slices,
  unallocated,
  balance,
  format,
}: {
  slices: { id: string; name: string; kind: string; color_token: string; amount: number }[];
  unallocated: number;
  balance: number;
  format: (value: number) => string;
}) {
  const total = Math.max(
    balance,
    slices.reduce((t, s) => t + Math.max(s.amount, 0), 0),
    1,
  );
  const pct = (value: number) => Math.max((Math.max(value, 0) / total) * 100, 0);

  return (
    // Bar only. A per-slice list here grew the card by a row per slice, so an
    // account with ten of them wrecked the grid — the full breakdown lives in
    // the Manage slices dialog.
    <div className="mt-4 space-y-2.5">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {slices.map((s) => (
          <span
            key={s.id}
            title={`${s.name} · ${format(s.amount)}`}
            className="h-full transition-[width] duration-700 hover:opacity-80"
            style={{ width: `${pct(s.amount)}%`, backgroundColor: `var(--color-${s.color_token})` }}
          />
        ))}
        {unallocated > 0 && (
          <span
            title={`Unallocated · ${format(unallocated)}`}
            className="h-full bg-muted-foreground/25 transition-[width] duration-700"
            style={{ width: `${pct(unallocated)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Empty state component for showing when there's no data.
 * Provides consistent styling across the app with optional icon, action, and link.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  linkTo,
  linkLabel,
  compact = false,
  className,
}: {
  /** Icon to display above the title */
  icon?: ReactNode;
  /** Main title text */
  title: string;
  /** Supporting description text */
  description?: string;
  /** Callback for the primary action button */
  action?: () => void;
  /** Label for the action button */
  actionLabel?: string;
  /** Route path for a link action */
  linkTo?: string;
  /** Label for the link */
  linkLabel?: string;
  /** Use compact sizing (less padding) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8" : "py-12",
        className,
      )}
    >
      {icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <p className="text-sm text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>}
      {action && actionLabel && (
        <button
          type="button"
          onClick={action}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
        >
          {actionLabel}
        </button>
      )}
      {linkTo && linkLabel && (
        <Link
          to={linkTo}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-xs text-primary transition-colors hover:bg-accent"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Empty state specifically designed for table bodies.
 * Renders as a table row spanning all columns.
 */
export function TableEmptyState({
  colSpan,
  icon,
  title,
  description,
}: {
  /** Number of columns to span */
  colSpan: number;
  /** Icon to display */
  icon?: ReactNode;
  /** Main title text */
  title: string;
  /** Supporting description text */
  description?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-16 text-center">
        {icon && (
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            {icon}
          </span>
        )}
        <p className="text-sm text-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
        )}
      </td>
    </tr>
  );
}

/**
 * Empty state card with dashed border, typically used for "Add new" actions.
 */
export function EmptyStateCard({
  icon,
  label,
  onClick,
  className,
}: {
  /** Icon to display */
  icon?: ReactNode;
  /** Label text */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
