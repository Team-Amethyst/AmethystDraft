/**
 * Position filter options for the research player table (must stay aligned with
 * `AppSelect` options in `PlayerTableControls`).
 */
export const PLAYER_TABLE_POSITIONS = [
  "all",
  "OF",
  "SS",
  "1B",
  "2B",
  "3B",
  "C",
  "DH",
  "P",
] as const;

/** Standard position order for tier Mix grids and other cross-tier alignment. */
export const RESEARCH_POSITION_DISPLAY_ORDER: readonly string[] =
  PLAYER_TABLE_POSITIONS.slice(1);

export const PLAYER_TABLE_HITTER_POSITIONS = [
  "OF",
  "SS",
  "1B",
  "2B",
  "3B",
  "C",
  "DH",
] as const;

export const PLAYER_TABLE_PITCHER_POSITIONS = ["P"] as const;

export function positionFilterOptionsForStatView(
  statView: "all" | "hitting" | "pitching",
): readonly string[] {
  if (statView === "hitting") return PLAYER_TABLE_HITTER_POSITIONS;
  if (statView === "pitching") return PLAYER_TABLE_PITCHER_POSITIONS;
  return PLAYER_TABLE_POSITIONS.slice(1);
}

/**
 * When switching hitters/pitchers mode, reset position filter if it is impossible
 * for that mode (e.g. pitcher-only while viewing hitters). Returns `null` if no change.
 */
const HITTER_SET: ReadonlySet<string> = new Set(PLAYER_TABLE_HITTER_POSITIONS);

const POSITION_DISPLAY_ORDER: ReadonlyMap<string, number> = new Map(
  RESEARCH_POSITION_DISPLAY_ORDER.map((pos, index) => [pos, index]),
);

/** Stable position order for tier headers and other cross-row comparisons (Research filter order). */
export function sortPositionCountEntries(
  entries: readonly (readonly [string, number])[],
): [string, number][] {
  return [...entries]
    .sort((a, b) => {
      const orderA = POSITION_DISPLAY_ORDER.get(a[0]) ?? 999;
      const orderB = POSITION_DISPLAY_ORDER.get(b[0]) ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a[0].localeCompare(b[0]);
    })
    .map(([pos, count]) => [pos, count]);
}

export function positionFilterAfterStatViewChange(
  nextStatView: "all" | "hitting" | "pitching",
  positionFilter: string,
): string | null {
  if (nextStatView === "hitting" && !HITTER_SET.has(positionFilter)) {
    return "all";
  }
  if (nextStatView === "pitching" && positionFilter !== "P") {
    return "all";
  }
  return null;
}
