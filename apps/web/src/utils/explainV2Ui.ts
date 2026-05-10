/**
 * Shared presentation helpers for Engine `explain_v2` driver copy
 * (Command Center bid card, player detail modal, etc.).
 */

export const DRIVER_PREVIEW_SOFT_MAX = 118;

export function truncateExplainText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** First readable clause for scanning; long tail goes behind `<details>`. */
export function summarizeDriverReason(reason: string): { preview: string; full: string } {
  const full = reason.trim();
  if (full.length <= DRIVER_PREVIEW_SOFT_MAX) {
    return { preview: full, full };
  }
  const semi = full.indexOf("; ");
  if (semi >= 10 && semi <= 240) {
    return { preview: full.slice(0, semi).trim(), full };
  }
  const paren = full.indexOf(" (");
  if (paren >= 16 && paren <= 160) {
    return { preview: full.slice(0, paren).trim(), full };
  }
  const dotSpace = full.indexOf(". ");
  if (dotSpace >= 20 && dotSpace <= 200) {
    return { preview: full.slice(0, dotSpace + 1).trim(), full };
  }
  return { preview: truncateExplainText(full, DRIVER_PREVIEW_SOFT_MAX), full };
}

export function formatSignedWhole(n: number): string {
  const r = Math.round(n);
  return r >= 0 ? `+${r}` : String(r);
}
