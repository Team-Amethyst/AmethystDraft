/**
 * Position filter options for the research player table (must stay aligned with
 * `<select>` options in `PlayerTableControls`).
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
