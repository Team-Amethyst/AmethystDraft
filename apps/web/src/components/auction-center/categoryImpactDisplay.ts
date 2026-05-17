/** Display-only roto delta for category impact cards (roto math unchanged upstream). */
export function formatRotoPointsDelta(
  rotoPtsLine: string | null | undefined,
): string {
  if (rotoPtsLine == null) return "—";
  const normalized = rotoPtsLine.replace(/\u2212/g, "-");
  const match = normalized.match(/^([+-]?\d+)\s+roto\s+pt/i);
  if (!match) {
    const stripped = rotoPtsLine.replace(/\s*roto\s*/i, " ").trim();
    return stripped || "—";
  }
  const raw = match[1]!;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n === 0) return "0 pts";
  const signed =
    raw.startsWith("+") || raw.startsWith("-") ? raw : n > 0 ? `+${n}` : `${n}`;
  const unit = Math.abs(n) === 1 ? "pt" : "pts";
  return `${signed} ${unit}`;
}

/** @deprecated Use {@link formatRotoPointsDelta}. */
export const formatRotoImpactFooter = formatRotoPointsDelta;

export type CategoryImpactStatusTone =
  | "green"
  | "red"
  | "neutral"
  | "muted"
  | "plain";

export function categoryImpactStatusTone(
  imp:
    | { neutral: boolean; improved: boolean; rotoPtsLine?: string | null }
    | undefined,
): CategoryImpactStatusTone {
  if (!imp) return "muted";
  if (formatRotoPointsDelta(imp.rotoPtsLine) === "0 pts") return "plain";
  if (imp.neutral) return "neutral";
  return imp.improved ? "green" : "red";
}

/** Screen-reader context for direction (not shown on card). */
export function categoryImpactRotoAriaLabel(
  impact:
    | {
        categoryEffectLabel: string;
        rotoPtsLine: string | null;
        name: string;
      }
    | undefined,
): string | undefined {
  if (!impact?.rotoPtsLine) return undefined;
  const delta = formatRotoPointsDelta(impact.rotoPtsLine);
  if (delta === "—") return undefined;
  const pointsWord = delta.endsWith(" pt") ? "roto point" : "roto points";
  const numeric = delta.replace(/\s*pts?$/, "");
  return `${impact.categoryEffectLabel} ${impact.name} by ${numeric} ${pointsWord}`;
}
