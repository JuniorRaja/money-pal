import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/money";

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
  icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  icon?: ReactNode;
  className?: string;
}) {
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
      <p className="numeric maskable mt-3 text-[28px] leading-none text-foreground">{value}</p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {typeof delta === "number" && (
          <span className={delta >= 0 ? "text-success" : "text-destructive"}>
            {formatPct(delta)}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
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

const sliceKindLabel: Record<string, string> = {
  owned: "Owned",
  custodial: "Held for",
  earmark: "Earmarked",
};

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
      <ul className="space-y-1">
        {slices.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Dot token={s.color_token} />
              <span className="truncate text-foreground">{s.name}</span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] uppercase tracking-[0.1em]">
                {sliceKindLabel[s.kind] ?? s.kind}
              </span>
            </span>
            <span
              className={cn(
                "numeric shrink-0",
                s.amount < 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {format(s.amount)}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
            {unallocated < 0 ? "Over-allocated" : "Unallocated"}
          </span>
          <span className={cn("numeric", unallocated < 0 && "text-destructive")}>
            {format(unallocated)}
          </span>
        </li>
      </ul>
    </div>
  );
}
