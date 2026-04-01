export type PositionGroup = "hitting" | "pitching";

const PITCHING_POSITIONS = new Set(["SP", "RP", "P"]);

/**
 * Normalize MLB API position abbreviations into canonical fantasy positions.
 */
export function normalizeFantasyPosition(
  position: string,
  group: PositionGroup,
): string {
  const normalized = position.toUpperCase().replace(/\s+/g, "");
  switch (normalized) {
    case "LF":
    case "CF":
    case "RF":
      return "OF";
    case "TWP":
      return group === "pitching" ? "SP" : "DH";
    case "IF":
      return "IF";
    case "UTL":
    case "UTIL":
      return "DH";
    default:
      return normalized;
  }
}

export function isPitchingPosition(position: string): boolean {
  return PITCHING_POSITIONS.has(position.toUpperCase());
}

/**
 * Prefer qualifying fielding positions when available, otherwise fall back to
 * the player's primary/stat position for the current stat group.
 */
export function resolveEligiblePositions(
  fieldingPositions: string[] | undefined,
  fallbackPosition: string,
  group: PositionGroup,
): string[] {
  const filteredFielding = (fieldingPositions ?? []).filter((position) =>
    group === "pitching"
      ? isPitchingPosition(position)
      : !isPitchingPosition(position),
  );

  if (filteredFielding.length > 0) {
    return [...new Set(filteredFielding)];
  }

  return [normalizeFantasyPosition(fallbackPosition, group)];
}