/**
 * Tag chips offered in the Player table filter (subset of `getCategoryTags` output).
 * Keep in sync with category tag generation in `@repo/player-stat-basis`.
 */
export const PLAYER_TABLE_FILTER_TAGS = [
  "HR+",
  "SB+",
  "AVG+",
  "R+",
  "RBI+",
  "K+",
  "W+",
  "SV+",
] as const;
