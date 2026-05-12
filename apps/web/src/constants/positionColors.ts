/**
 * Position accent palette (foreground + badge chrome) shared by PosBadge,
 * My Draft allocation segments, and any other UI that keys off roster slot.
 */

export interface PositionColorStyle {
  readonly bg: string;
  readonly color: string;
  readonly border: string;
}

const POSITION_COLOR_STYLE: Record<string, PositionColorStyle> = {
  C: {
    bg: "rgba(239,68,68,0.14)",
    color: "#f87171",
    border: "rgba(239,68,68,0.28)",
  },
  "1B": {
    bg: "rgba(245,158,11,0.14)",
    color: "#fbbf24",
    border: "rgba(245,158,11,0.28)",
  },
  "2B": {
    bg: "rgba(56,189,248,0.14)",
    color: "#38bdf8",
    border: "rgba(56,189,248,0.28)",
  },
  "3B": {
    bg: "rgba(249,115,22,0.14)",
    color: "#fb923c",
    border: "rgba(249,115,22,0.28)",
  },
  SS: {
    bg: "rgba(34,211,238,0.14)",
    color: "#22d3ee",
    border: "rgba(34,211,238,0.28)",
  },
  OF: {
    bg: "rgba(34,197,94,0.14)",
    color: "#4ade80",
    border: "rgba(34,197,94,0.28)",
  },
  DH: {
    bg: "rgba(192,132,252,0.14)",
    color: "#c084fc",
    border: "rgba(192,132,252,0.28)",
  },
  SP: {
    bg: "rgba(129,140,248,0.14)",
    color: "#818cf8",
    border: "rgba(129,140,248,0.28)",
  },
  RP: {
    bg: "rgba(244,114,182,0.14)",
    color: "#f472b6",
    border: "rgba(244,114,182,0.28)",
  },
  P: {
    bg: "rgba(129,140,248,0.14)",
    color: "#818cf8",
    border: "rgba(129,140,248,0.28)",
  },
  IF: {
    bg: "rgba(148,163,184,0.14)",
    color: "#94a3b8",
    border: "rgba(148,163,184,0.28)",
  },
  UTIL: {
    bg: "rgba(148,163,184,0.14)",
    color: "#94a3b8",
    border: "rgba(148,163,184,0.28)",
  },
  BN: {
    bg: "rgba(100,116,139,0.14)",
    color: "#64748b",
    border: "rgba(100,116,139,0.28)",
  },
};

const DEFAULT: PositionColorStyle = {
  bg: "rgba(139,92,246,0.12)",
  color: "#a78bfa",
  border: "rgba(139,92,246,0.25)",
};

export function positionColorStyle(pos: string): PositionColorStyle {
  return POSITION_COLOR_STYLE[pos.toUpperCase()] ?? DEFAULT;
}
