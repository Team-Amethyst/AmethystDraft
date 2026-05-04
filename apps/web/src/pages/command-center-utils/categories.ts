/** Extracts the abbreviation from labels like "Walks + Hits per IP (WHIP)" -> "WHIP" */
export function normalizeCatName(name: string): string {
  const m = name.match(/\(([^)]+)\)$/);
  return m ? m[1] : name;
}

export const LOWER_IS_BETTER_CATS = new Set([
  "ERA",
  "WHIP",
  "WALKS + HITS PER IP",
  "W+H/IP",
]);

/** Batting rate categories aggregated as a weighted average (matches projected standings). */
export const ROTO_RATE_BATTING_CATEGORIES = new Set(["AVG", "OBP", "SLG"]);
