/**
 * Page signature artwork.
 *
 * Every page gets its own watermark, but all of them share one visual
 * language: thin gold linework, low-opacity layered silhouettes, a sun disc,
 * topographic contour lines and faint dot markers, dissolving into the page.
 */
import type { JSX } from "react";

export type SignatureKey =
  | "overview"
  | "accounts"
  | "transactions"
  | "timeline"
  | "budgets"
  | "goals"
  | "investments"
  | "reports"
  | "assistant"
  | "imports"
  | "settings"
  | "login";

const line = "currentColor";

function Frame({ children }: { children: JSX.Element }) {
  return (
    <svg
      viewBox="0 0 1200 260"
      preserveAspectRatio="xMaxYMid slice"
      className="h-full w-full text-primary"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="mm-fade" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.45" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="mm-fill" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.02" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      {children}
    </svg>
  );
}

const dots = (points: [number, number][]) => (
  <g fill={line} opacity="0.35">
    {points.map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" />
    ))}
  </g>
);

const contour = (d: string, opacity = 0.22) => (
  <path d={d} fill="none" stroke="url(#mm-fade)" strokeWidth="1.2" opacity={opacity} />
);

const art: Record<SignatureKey, JSX.Element> = {
  overview: (
    <>
      <circle cx="880" cy="86" r="70" fill="url(#mm-fill)" />
      <path d="M600 260 L760 130 L860 200 L980 110 L1200 260 Z" fill="url(#mm-fill)" />
      {contour("M0 190 C240 150 420 210 640 168 C860 126 1030 176 1200 140")}
      {contour("M0 218 C260 190 470 236 700 200 C930 164 1060 208 1200 182", 0.16)}
      {dots([
        [420, 176],
        [700, 186],
        [980, 150],
      ])}
    </>
  ),
  accounts: (
    <>
      <path
        d="M540 260 L700 96 L800 190 L900 60 L1060 190 L1130 140 L1200 260 Z"
        fill="url(#mm-fill)"
      />
      <path
        d="M700 96 L800 190 M900 60 L1060 190"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
        fill="none"
      />
      {contour("M0 206 C260 176 430 220 660 190 C900 158 1040 196 1200 168")}
      {dots([
        [700, 96],
        [900, 60],
        [1130, 140],
      ])}
    </>
  ),
  transactions: (
    <>
      <circle cx="1000" cy="70" r="52" fill="url(#mm-fill)" />
      {contour("M0 150 C220 110 330 200 560 172 C790 144 900 90 1200 118", 0.3)}
      {contour("M0 182 C240 150 350 232 590 202 C830 172 940 128 1200 152", 0.24)}
      {contour("M0 214 C250 190 380 258 620 230 C860 202 960 166 1200 188", 0.18)}
      <path d="M620 260 L780 176 L900 226 L1040 150 L1200 260 Z" fill="url(#mm-fill)" />
      {dots([
        [330, 172],
        [660, 196],
        [1040, 150],
      ])}
    </>
  ),
  timeline: (
    <>
      <path
        d="M0 214 C220 214 260 148 480 148 C700 148 760 92 980 92 C1090 92 1140 76 1200 76"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.6"
      />
      <path d="M640 260 L820 150 L950 210 L1200 96 L1200 260 Z" fill="url(#mm-fill)" />
      {contour("M0 240 C300 232 520 200 780 196 C1000 192 1080 176 1200 172", 0.18)}
      {dots([
        [260, 190],
        [480, 148],
        [760, 118],
        [980, 92],
      ])}
    </>
  ),
  budgets: (
    <>
      <path d="M660 260 L660 200 L1200 152 L1200 260 Z" fill="url(#mm-fill)" />
      <path
        d="M700 200 L1200 158 M740 226 L1200 190 M780 250 L1200 220"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="820" cy="80" r="46" fill="url(#mm-fill)" />
      {contour("M0 196 C240 168 440 210 680 182 C900 156 1030 190 1200 164")}
      {dots([
        [560, 190],
        [880, 168],
      ])}
    </>
  ),
  goals: (
    <>
      <path d="M700 260 L940 70 L1200 260 Z" fill="url(#mm-fill)" />
      <path
        d="M940 70 L940 24 L1024 42 L940 60"
        fill="url(#mm-fill)"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
      />
      {contour("M0 204 C260 178 420 224 660 196 C880 170 1020 200 1200 178")}
      {contour("M0 232 C280 214 460 250 700 226 C920 204 1050 226 1200 210", 0.15)}
      {dots([
        [520, 200],
        [940, 70],
      ])}
    </>
  ),
  investments: (
    <>
      <path d="M560 260 L720 200 L840 150 L980 96 L1200 34 L1200 260 Z" fill="url(#mm-fill)" />
      <path
        d="M560 232 L740 186 L880 138 L1040 84 L1200 46"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.6"
      />
      {contour("M0 220 C240 200 420 236 660 212 C880 190 1020 208 1200 194", 0.16)}
      {dots([
        [740, 186],
        [880, 138],
        [1040, 84],
      ])}
    </>
  ),
  reports: (
    <>
      {contour("M540 250 C660 210 700 130 840 122 C980 114 1040 168 1200 150", 0.3)}
      {contour("M560 260 C700 226 740 150 880 142 C1010 134 1080 182 1200 168", 0.24)}
      {contour("M600 260 C740 240 780 172 910 164 C1030 156 1100 196 1200 186", 0.18)}
      <circle cx="880" cy="80" r="44" fill="url(#mm-fill)" />
      {dots([
        [840, 122],
        [1040, 158],
      ])}
    </>
  ),
  assistant: (
    <>
      <path
        d="M660 200 L760 120 L880 168 L980 70 L1100 128"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
      />
      <path d="M700 260 L860 190 L1000 232 L1200 160 L1200 260 Z" fill="url(#mm-fill)" />
      {dots([
        [660, 200],
        [760, 120],
        [880, 168],
        [980, 70],
        [1100, 128],
        [560, 150],
      ])}
      {contour("M0 214 C250 196 460 230 700 208 C920 188 1050 212 1200 196", 0.14)}
    </>
  ),
  imports: (
    <>
      <path d="M620 260 L620 170 Q700 96 780 170 L780 260 Z" fill="url(#mm-fill)" />
      <path d="M820 260 L820 170 Q900 96 980 170 L980 260 Z" fill="url(#mm-fill)" />
      <path d="M1020 260 L1020 170 Q1100 96 1180 170 L1180 260 Z" fill="url(#mm-fill)" />
      <path d="M580 150 L1200 150" stroke="url(#mm-fade)" strokeWidth="1.4" fill="none" />
      {contour("M0 206 C240 186 420 216 660 196 C900 176 1030 200 1200 184", 0.14)}
      {dots([
        [700, 118],
        [900, 118],
        [1100, 118],
      ])}
    </>
  ),
  settings: (
    <>
      <circle cx="960" cy="130" r="40" fill="url(#mm-fill)" />
      <circle cx="960" cy="130" r="72" fill="none" stroke="url(#mm-fade)" strokeWidth="1.2" />
      <circle
        cx="960"
        cy="130"
        r="106"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
        opacity="0.7"
      />
      <circle
        cx="960"
        cy="130"
        r="142"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
        opacity="0.45"
      />
      {contour("M0 212 C260 190 440 226 680 202 C900 180 1040 206 1200 188", 0.14)}
      {dots([
        [960, 24],
        [1102, 130],
      ])}
    </>
  ),
  login: (
    <>
      <circle cx="700" cy="120" r="130" fill="url(#mm-fill)" />
      <path d="M0 260 L220 120 L360 220 L520 100 L760 260 Z" fill="url(#mm-fill)" />
      <path d="M600 260 L820 130 L1000 230 L1200 120 L1200 260 Z" fill="url(#mm-fill)" />
      {contour("M0 200 C240 176 420 214 660 190 C900 166 1040 198 1200 176", 0.24)}
      {contour("M0 230 C260 212 460 244 700 222 C920 202 1060 224 1200 208", 0.16)}
      {dots([
        [360, 220],
        [820, 130],
      ])}
    </>
  ),
};

export function Signature({ variant }: { variant: SignatureKey }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <Frame>{art[variant]}</Frame>
    </div>
  );
}
