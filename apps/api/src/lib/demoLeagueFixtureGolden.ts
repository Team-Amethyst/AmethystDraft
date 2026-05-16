/** Expected values from 2026Draft.xlsx wide conversion (pre_draft checkpoint). */
export const DEMO_PRE_DRAFT_GOLDEN = {
  teamCount: 9,
  keeperCounts: {
    "Team A": 7,
    "Team B": 11,
    "Team C": 9,
    "Team D": 7,
    "Team E": 8,
    "Team F": 9,
    "Team G": 8,
    "Team H": 7,
    "Team I": 10,
  },
  remainingBudgets: {
    "Team A": 182,
    "Team B": 149,
    "Team C": 177,
    "Team D": 162,
    "Team E": 92,
    "Team F": 194,
    "Team G": 198,
    "Team H": 166,
    "Team I": 104,
  },
  minorsCounts: {
    "Team A": 8,
    "Team B": 6,
    "Team C": 8,
    "Team D": 5,
    "Team E": 8,
    "Team F": 6,
    "Team G": 8,
    "Team H": 8,
    "Team I": 5,
  },
  taxiCounts: {
    "Team A": 8,
    "Team B": 8,
    "Team C": 8,
    "Team D": 8,
    "Team E": 8,
    "Team F": 8,
    "Team G": 8,
    "Team H": 8,
    "Team I": 8,
  },
  draftPickCountFullWorkbook: 133,
} as const;

export const FANTASY_TEAM_NAMES = [
  "Team A",
  "Team B",
  "Team C",
  "Team D",
  "Team E",
  "Team F",
  "Team G",
  "Team H",
  "Team I",
] as const;

export { fantasyNameForTeamId } from "./fantasyTeamNames";

export function isReserveRosterSlot(rosterSlot: string): boolean {
  const slot = rosterSlot.toUpperCase();
  return slot.includes("MIN") || slot.includes("TAXI");
}
