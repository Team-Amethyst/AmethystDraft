/**
 * Expected counts from the instructor 2026Draft.xlsx workbook (9-team wide layout).
 * Used by Vitest to catch regressions without committing the binary workbook.
 */

/** @type {Record<string, number>} fantasy name → keeper count */
export const GOLDEN_KEEPER_COUNTS = {
  "Team A": 7,
  "Team B": 11,
  "Team C": 9,
  "Team D": 7,
  "Team E": 8,
  "Team F": 9,
  "Team G": 8,
  "Team H": 7,
  "Team I": 10,
};

/** @type {Record<string, number>} remaining $ in Pre-Draft header (not 260) */
export const GOLDEN_REMAINING_BUDGETS = {
  "Team A": 182,
  "Team B": 149,
  "Team C": 177,
  "Team D": 162,
  "Team E": 92,
  "Team F": 194,
  "Team G": 198,
  "Team H": 166,
  "Team I": 104,
};

export const GOLDEN_DRAFT_PICK_COUNT = 133;
export const GOLDEN_TEAM_COUNT = 9;
export const GOLDEN_TAXI_PER_TEAM = 8;
