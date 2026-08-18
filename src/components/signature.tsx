/**
 * Page signature artwork.
 *
 * Every page gets its own watermark, but all of them share one visual
 * language: thin gold linework, low-opacity layered silhouettes, a sun disc,
 * topographic contour lines and faint dot markers, dissolving into the page.
 */
import type { JSX } from "react";

import type { ThemePattern } from "@/data/schema";

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

const mountain: Record<SignatureKey, JSX.Element> = {
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

// -----------------------------------------------------------------------------
// Forest
// -----------------------------------------------------------------------------

/**
 * A conifer, drawn as three overlapping triangles in one path. At the low fill
 * opacity these silhouettes use, separate tiers read as a tree where a single
 * triangle reads as a mountain.
 */
function conifer(x: number, base: number, h: number, w: number, key: string) {
  return (
    <path
      key={key}
      fill="url(#mm-fill)"
      d={
        `M${x - w / 2} ${base} L${x} ${base - h * 0.58} L${x + w / 2} ${base} Z ` +
        `M${x - w * 0.38} ${base - h * 0.3} L${x} ${base - h * 0.82} L${x + w * 0.38} ${base - h * 0.3} Z ` +
        `M${x - w * 0.26} ${base - h * 0.58} L${x} ${base - h} L${x + w * 0.26} ${base - h * 0.58} Z`
      }
    />
  );
}

/** A row of conifers standing on `base`. Each entry is [x, height, width]. */
const grove = (base: number, trees: [number, number, number][], prefix: string) => (
  <g>{trees.map(([x, h, w], i) => conifer(x, base, h, w, `${prefix}-${i}`))}</g>
);

/** A round-canopy tree, for the routes where the pointed grove is too busy. */
const canopy = (x: number, base: number, r: number, key: string) => (
  <g key={key}>
    {/* A filled trunk, not a stroked line: `mm-fade` is an objectBoundingBox
        gradient, so a perfectly vertical path has a zero-width box and renders
        as nothing, and a hairline stroke vanishes at thumbnail size anyway. */}
    <rect
      x={x - r * 0.09}
      y={base - r * 1.5}
      width={r * 0.18}
      height={r * 1.5}
      fill="url(#mm-fill)"
    />
    <circle cx={x} cy={base - r * 1.5} r={r} fill="url(#mm-fill)" />
  </g>
);

const forest: Record<SignatureKey, JSX.Element> = {
  overview: (
    <>
      <circle cx="880" cy="80" r="64" fill="url(#mm-fill)" />
      {grove(
        260,
        [
          [620, 96, 86],
          [700, 132, 104],
          [790, 104, 92],
          [880, 150, 116],
          [980, 118, 98],
          [1080, 146, 112],
          [1170, 100, 88],
        ],
        "f-ov",
      )}
      {contour("M0 190 C240 150 420 210 640 168 C860 126 1030 176 1200 140")}
      {dots([
        [420, 176],
        [560, 150],
        [300, 196],
      ])}
    </>
  ),
  accounts: (
    <>
      {grove(
        260,
        [
          [560, 88, 80],
          [640, 124, 96],
          [720, 96, 84],
        ],
        "f-ac1",
      )}
      {grove(
        226,
        [
          [820, 110, 92],
          [900, 142, 108],
          [980, 112, 94],
        ],
        "f-ac2",
      )}
      {grove(
        196,
        [
          [1060, 120, 96],
          [1150, 152, 112],
        ],
        "f-ac3",
      )}
      {contour("M0 206 C260 176 430 220 660 190 C900 158 1040 196 1200 168")}
      {dots([
        [640, 132],
        [900, 80],
        [1150, 40],
      ])}
    </>
  ),
  transactions: (
    <>
      <circle cx="1000" cy="66" r="48" fill="url(#mm-fill)" />
      {contour("M0 150 C220 110 330 200 560 172 C790 144 900 90 1200 118", 0.3)}
      {contour("M0 182 C240 150 350 232 590 202 C830 172 940 128 1200 152", 0.2)}
      {grove(
        260,
        [
          [600, 92, 82],
          [690, 126, 98],
          [780, 100, 88],
          [880, 134, 104],
          [980, 106, 92],
          [1090, 138, 108],
          [1180, 98, 86],
        ],
        "f-tx",
      )}
      {dots([
        [330, 172],
        [500, 196],
        [200, 156],
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
      {grove(
        260,
        [
          [640, 104, 88],
          [740, 140, 106],
          [850, 110, 92],
          [960, 146, 112],
          [1080, 116, 96],
          [1180, 144, 110],
        ],
        "f-tl",
      )}
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
      {grove(
        260,
        [
          [700, 118, 96],
          [800, 150, 112],
          [900, 120, 98],
          [1000, 152, 114],
          [1110, 124, 100],
        ],
        "f-bg",
      )}
      <path
        d="M660 228 L1200 228 M660 246 L1200 246"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="820" cy="74" r="42" fill="url(#mm-fill)" />
      {contour("M0 196 C240 168 440 210 680 182 C900 156 1030 190 1200 164")}
      {dots([
        [560, 190],
        [400, 168],
      ])}
    </>
  ),
  goals: (
    <>
      {conifer(940, 260, 200, 150, "f-gl-hero")}
      <path
        d="M940 60 L940 22 L1022 40 L940 58"
        fill="url(#mm-fill)"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
      />
      {grove(
        260,
        [
          [760, 104, 90],
          [840, 82, 74],
          [1050, 96, 84],
          [1140, 118, 98],
        ],
        "f-gl",
      )}
      {contour("M0 204 C260 178 420 224 660 196 C880 170 1020 200 1200 178")}
      {dots([
        [520, 200],
        [940, 60],
      ])}
    </>
  ),
  investments: (
    <>
      {grove(
        260,
        [
          [600, 70, 70],
          [700, 96, 82],
          [800, 124, 94],
          [900, 152, 106],
          [1000, 180, 118],
          [1110, 208, 130],
        ],
        "f-iv",
      )}
      <path
        d="M580 208 L720 178 L840 148 L980 104 L1180 56"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.6"
      />
      {contour("M0 220 C240 200 420 236 660 212 C880 190 1020 208 1200 194", 0.16)}
      {dots([
        [720, 178],
        [980, 104],
        [1180, 56],
      ])}
    </>
  ),
  reports: (
    <>
      {contour("M540 250 C660 210 700 130 840 122 C980 114 1040 168 1200 150", 0.3)}
      {contour("M560 260 C700 226 740 150 880 142 C1010 134 1080 182 1200 168", 0.2)}
      <circle cx="880" cy="70" r="40" fill="url(#mm-fill)" />
      {grove(
        260,
        [
          [640, 96, 84],
          [740, 124, 96],
          [860, 102, 88],
          [980, 130, 102],
          [1100, 106, 90],
        ],
        "f-rp",
      )}
      {dots([
        [840, 122],
        [1040, 158],
      ])}
    </>
  ),
  assistant: (
    <>
      {grove(
        260,
        [
          [660, 110, 92],
          [780, 140, 106],
          [920, 112, 94],
          [1060, 144, 110],
          [1170, 108, 90],
        ],
        "f-as",
      )}
      <path
        d="M660 150 L760 96 L880 130 L980 62 L1100 108"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
      />
      {dots([
        [660, 150],
        [760, 96],
        [880, 130],
        [980, 62],
        [1100, 108],
        [560, 120],
      ])}
      {contour("M0 214 C250 196 460 230 700 208 C920 188 1050 212 1200 196", 0.14)}
    </>
  ),
  imports: (
    <>
      {canopy(700, 260, 46, "f-im1")}
      {canopy(900, 260, 46, "f-im2")}
      {canopy(1100, 260, 46, "f-im3")}
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
      {conifer(960, 260, 176, 132, "f-set-hero")}
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
      <circle cx="700" cy="104" r="120" fill="url(#mm-fill)" />
      {grove(
        228,
        [
          [80, 110, 94],
          [200, 140, 108],
          [330, 112, 96],
          [460, 142, 110],
          [590, 114, 98],
          [720, 146, 112],
          [850, 116, 100],
          [980, 148, 114],
          [1120, 118, 102],
        ],
        "f-lg1",
      )}
      {grove(
        260,
        [
          [0, 130, 104],
          [140, 168, 124],
          [290, 134, 106],
          [440, 170, 126],
          [600, 136, 108],
          [760, 172, 128],
          [920, 138, 110],
          [1080, 174, 130],
          [1200, 140, 112],
        ],
        "f-lg2",
      )}
      {contour("M0 200 C240 176 420 214 660 190 C900 166 1040 198 1200 176", 0.2)}
      {dots([
        [360, 206],
        [820, 118],
      ])}
    </>
  ),
};

// -----------------------------------------------------------------------------
// Ocean
// -----------------------------------------------------------------------------

const VIEW_W = 1200;

/**
 * A wave across the full width, built from alternating quadratic humps.
 * `closed` runs it down to the bottom edge so it fills as a swell instead of
 * reading as a single crest line.
 */
function wavePath(y: number, amp: number, wavelength: number, closed: boolean) {
  const steps = Math.ceil(VIEW_W / wavelength);
  const half = wavelength / 2;
  // A quadratic reaches half its control offset, so the control is doubled to
  // make `amp` mean the crest height you actually see.
  const pull = amp * 2;
  let d = `M0 ${y}`;
  for (let i = 0; i < steps; i += 1) {
    d += ` q${wavelength / 4} ${-pull} ${half} 0 q${wavelength / 4} ${pull} ${half} 0`;
  }
  return closed ? `${d} L${steps * wavelength} 260 L0 260 Z` : d;
}

/** Filled water body. Stacking several builds depth the way the ridges do. */
const swell = (y: number, amp: number, wavelength: number) => (
  <path d={wavePath(y, amp, wavelength, true)} fill="url(#mm-fill)" />
);

/** Unfilled wave line — the ocean counterpart to `contour`. */
const crest = (y: number, amp: number, wavelength: number, opacity = 0.24) => (
  <path
    d={wavePath(y, amp, wavelength, false)}
    fill="none"
    stroke="url(#mm-fade)"
    strokeWidth="1.3"
    opacity={opacity}
  />
);

const ocean: Record<SignatureKey, JSX.Element> = {
  overview: (
    <>
      <circle cx="880" cy="76" r="66" fill="url(#mm-fill)" />
      {crest(150, 14, 200, 0.3)}
      {crest(178, 12, 160, 0.2)}
      {swell(202, 16, 200)}
      {dots([
        [420, 168],
        [700, 182],
        [980, 146],
      ])}
    </>
  ),
  accounts: (
    <>
      {crest(126, 9, 260, 0.24)}
      {swell(152, 10, 260)}
      {swell(192, 13, 200)}
      {swell(230, 16, 160)}
      {dots([
        [700, 140],
        [900, 180],
        [1130, 218],
      ])}
    </>
  ),
  transactions: (
    <>
      <circle cx="1000" cy="64" r="50" fill="url(#mm-fill)" />
      {crest(140, 16, 200, 0.3)}
      {crest(172, 14, 200, 0.22)}
      {crest(204, 12, 200, 0.16)}
      {swell(226, 14, 160)}
      {dots([
        [330, 164],
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
      {crest(186, 11, 180, 0.16)}
      {swell(214, 15, 180)}
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
      <circle cx="820" cy="76" r="44" fill="url(#mm-fill)" />
      {crest(158, 11, 200, 0.2)}
      {swell(188, 14, 200)}
      <path
        d="M660 210 L660 260 M760 204 L760 260 M860 210 L860 260 M960 204 L960 260 M1060 210 L1060 260 M1160 204 L1160 260"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
        fill="none"
      />
      {dots([
        [560, 190],
        [400, 166],
      ])}
    </>
  ),
  goals: (
    <>
      <path d="M760 216 L940 66 L1120 216 Z" fill="url(#mm-fill)" />
      <path
        d="M940 66 L940 22 L1022 40 L940 58"
        fill="url(#mm-fill)"
        stroke="url(#mm-fade)"
        strokeWidth="1.2"
      />
      {crest(180, 11, 180, 0.16)}
      {swell(208, 15, 180)}
      {dots([
        [520, 200],
        [940, 66],
      ])}
    </>
  ),
  investments: (
    <>
      {crest(186, 11, 180, 0.18)}
      {swell(216, 14, 180)}
      <path
        d="M560 232 L740 186 L880 138 L1040 84 L1200 46"
        fill="none"
        stroke="url(#mm-fade)"
        strokeWidth="1.6"
      />
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
      {contour("M560 260 C700 226 740 150 880 142 C1010 134 1080 182 1200 168", 0.22)}
      <circle cx="880" cy="72" r="42" fill="url(#mm-fill)" />
      {swell(224, 13, 160)}
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
      {crest(186, 10, 180, 0.14)}
      {swell(214, 15, 180)}
      {dots([
        [660, 200],
        [760, 120],
        [880, 168],
        [980, 70],
        [1100, 128],
        [560, 150],
      ])}
    </>
  ),
  imports: (
    <>
      <path d="M620 260 L620 190 Q700 130 780 190 L780 260 Z" fill="url(#mm-fill)" />
      <path d="M820 260 L820 190 Q900 130 980 190 L980 260 Z" fill="url(#mm-fill)" />
      <path d="M1020 260 L1020 190 Q1100 130 1180 190 L1180 260 Z" fill="url(#mm-fill)" />
      <path d="M580 150 L1200 150" stroke="url(#mm-fade)" strokeWidth="1.4" fill="none" />
      {crest(210, 10, 140, 0.16)}
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
      {crest(192, 10, 180, 0.14)}
      {swell(218, 14, 180)}
      {dots([
        [960, 24],
        [1102, 130],
      ])}
    </>
  ),
  login: (
    <>
      <circle cx="700" cy="112" r="128" fill="url(#mm-fill)" />
      {crest(160, 16, 260, 0.24)}
      {swell(192, 18, 260)}
      {swell(228, 14, 160)}
      {dots([
        [360, 212],
        [820, 130],
      ])}
    </>
  ),
};

const art: Record<ThemePattern, Record<SignatureKey, JSX.Element>> = {
  mountain,
  forest,
  ocean,
};

export function Signature({
  variant,
  pattern = "mountain",
}: {
  variant: SignatureKey;
  pattern?: ThemePattern;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <Frame>{art[pattern][variant]}</Frame>
    </div>
  );
}
