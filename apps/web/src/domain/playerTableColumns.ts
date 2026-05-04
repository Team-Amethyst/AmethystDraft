/**
 * Default stat columns when the league has no custom scoring categories.
 * League-specific columns use the parenthetical abbrev in the category name when present.
 */
export const DEFAULT_PLAYER_TABLE_BAT_COLS = [
  "AVG",
  "HR",
  "RBI",
  "R",
  "SB",
] as const;

export const DEFAULT_PLAYER_TABLE_PIT_COLS = [
  "ERA",
  "K",
  "W",
  "SV",
  "WHIP",
] as const;

/** e.g. "Runs (R)" → "R" */
export function statAbbrevFromScoringCategoryName(name: string): string {
  return name.match(/\(([^)]+)\)$/)?.[1] ?? name;
}

export function battingStatColumnLabels(
  scoringCategories: { name: string; type: string }[] | undefined,
): string[] {
  const cats = (scoringCategories ?? []).filter((c) => c.type === "batting");
  return cats.length > 0
    ? cats.map((c) => statAbbrevFromScoringCategoryName(c.name))
    : [...DEFAULT_PLAYER_TABLE_BAT_COLS];
}

export function pitchingStatColumnLabels(
  scoringCategories: { name: string; type: string }[] | undefined,
): string[] {
  const cats = (scoringCategories ?? []).filter((c) => c.type === "pitching");
  return cats.length > 0
    ? cats.map((c) => statAbbrevFromScoringCategoryName(c.name))
    : [...DEFAULT_PLAYER_TABLE_PIT_COLS];
}
