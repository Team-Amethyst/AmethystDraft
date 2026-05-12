/** Wizard steps for the Create League flow (LeaguesCreate). */
export type LeagueCreateStep = 1 | 2 | 3 | 4;

export const LEAGUE_CREATE_STEP_LABELS: Record<LeagueCreateStep, string> = {
  1: "League Setup",
  2: "Scoring",
  3: "Team Names",
  4: "Keepers",
};
