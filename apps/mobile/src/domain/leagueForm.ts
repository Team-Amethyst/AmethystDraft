import type { EngineCheckpointKey, LeaguePlayerPool, LeagueScoringCategory } from "../api/leagues";
import type { League } from "../types/league";

export type LeagueWizardStep = 1 | 2 | 3 | 4;
export type LeagueSettingsSection = "setup" | "scoring" | "teams" | "keepers";

export type RosterSlotDefinition = {
  position: string;
  label: string;
  count: number;
};

export type LeagueStatDefinition = {
  key: string;
  label: string;
  type: "batting" | "pitching";
};

export type PlayerPoolOption = {
  label: "Mixed MLB" | "AL-Only" | "NL-Only";
  apiValue: LeaguePlayerPool;
  description: string;
};

export type CheckpointOption = {
  key: EngineCheckpointKey;
  label: string;
};

export const LEAGUE_TEAMS_MIN = 2;
export const LEAGUE_TEAMS_MAX = 30;
export const DEFAULT_LEAGUE_NAME = "Friendly League";
export const DEFAULT_TEAM_COUNT = 12;
export const DEFAULT_BUDGET = 260;
export const DEFAULT_POS_ELIGIBILITY_THRESHOLD = 20;
export const DEFAULT_SEASON_YEAR = 2026;

export const ROSTER_SLOT_DEFINITIONS: RosterSlotDefinition[] = [
  { position: "C", label: "Catcher", count: 1 },
  { position: "1B", label: "First Base", count: 1 },
  { position: "2B", label: "Second Base", count: 1 },
  { position: "SS", label: "Shortstop", count: 1 },
  { position: "3B", label: "Third Base", count: 1 },
  { position: "MI", label: "Middle Infield", count: 1 },
  { position: "CI", label: "Corner Infield", count: 1 },
  { position: "OF", label: "Outfield", count: 3 },
  { position: "UTIL", label: "Utility", count: 1 },
  { position: "SP", label: "Starting Pitcher", count: 5 },
  { position: "RP", label: "Relief Pitcher", count: 2 },
  { position: "BN", label: "Bench", count: 3 },
];

export const ROSTER_SLOT_ORDER = ROSTER_SLOT_DEFINITIONS.map((row) => row.position);

export const DEFAULT_ROSTER_SLOTS: Record<string, number> = Object.fromEntries(
  ROSTER_SLOT_DEFINITIONS.map((row) => [row.position, row.count]),
);

export const HITTING_STATS: LeagueStatDefinition[] = [
  { key: "R", label: "Runs (R)", type: "batting" },
  { key: "HR", label: "Home Runs (HR)", type: "batting" },
  { key: "RBI", label: "Runs Batted In (RBI)", type: "batting" },
  { key: "SB", label: "Stolen Bases (SB)", type: "batting" },
  { key: "AVG", label: "Batting Average (AVG)", type: "batting" },
  { key: "OBP", label: "On-Base Percentage (OBP)", type: "batting" },
  { key: "SLG", label: "Slugging Percentage (SLG)", type: "batting" },
  { key: "TB", label: "Total Bases (TB)", type: "batting" },
  { key: "H", label: "Hits (H)", type: "batting" },
  { key: "BB", label: "Walks (BB)", type: "batting" },
  { key: "K", label: "Strikeouts (K)", type: "batting" },
];

export const PITCHING_STATS: LeagueStatDefinition[] = [
  { key: "W", label: "Wins (W)", type: "pitching" },
  { key: "K", label: "Strikeouts (K)", type: "pitching" },
  { key: "ERA", label: "Earned Run Average (ERA)", type: "pitching" },
  { key: "WHIP", label: "Walks + Hits per IP (WHIP)", type: "pitching" },
  { key: "SV", label: "Saves (SV)", type: "pitching" },
  { key: "HLD", label: "Holds (HLD)", type: "pitching" },
  { key: "IP", label: "Innings Pitched (IP)", type: "pitching" },
  { key: "CG", label: "Complete Games (CG)", type: "pitching" },
];

export const DEFAULT_HITTING_STATS = ["R", "HR", "RBI", "SB", "AVG"];
export const DEFAULT_PITCHING_STATS = ["W", "K", "ERA", "WHIP", "SV"];

export const PLAYER_POOL_OPTIONS: PlayerPoolOption[] = [
  {
    label: "Mixed MLB",
    apiValue: "Mixed",
    description: "All players available",
  },
  {
    label: "AL-Only",
    apiValue: "AL",
    description: "American League only",
  },
  {
    label: "NL-Only",
    apiValue: "NL",
    description: "National League only",
  },
];

export const CHECKPOINT_OPTIONS: CheckpointOption[] = [
  { key: "pre_draft", label: "Pre-draft" },
  { key: "after_pick_10", label: "After pick 10" },
  { key: "after_pick_50", label: "After pick 50" },
  { key: "after_pick_100", label: "After pick 100" },
  { key: "after_pick_130", label: "After pick 130" },
  { key: "finished_league", label: "Finished league" },
];

export function checkpointLabel(key: EngineCheckpointKey): string {
  return CHECKPOINT_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

export function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildDefaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Team ${index + 1}`);
}

export function normalizeTeamNames(count: number, names?: readonly string[] | null): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const provided = names?.[index]?.trim();
    return provided && provided.length > 0 ? provided : `Team ${index + 1}`;
  });
}

export function normalizeRosterSlots(slots?: Record<string, number> | null): Record<string, number> {
  const result = { ...DEFAULT_ROSTER_SLOTS };

  if (!slots) {
    return result;
  }

  for (const [position, value] of Object.entries(slots)) {
    const parsed = Number(value);
    result[position] = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  return result;
}

export function rosterSpotsTotal(slots: Record<string, number>): number {
  return Object.values(slots).reduce((sum, value) => sum + Math.max(0, Math.round(value)), 0);
}

export function buildScoringCategories(
  hittingKeys: string[],
  pitchingKeys: string[],
): LeagueScoringCategory[] {
  return [
    ...hittingKeys.map((name) => ({ name, type: "batting" as const })),
    ...pitchingKeys.map((name) => ({ name, type: "pitching" as const })),
  ];
}

export function scoringKeysByType(
  categories: readonly LeagueScoringCategory[] | undefined,
): { hitting: string[]; pitching: string[] } {
  const hitting: string[] = [];
  const pitching: string[] = [];

  for (const category of categories ?? []) {
    const key = extractStatAbbreviation(category.name);

    if (category.type === "batting" && key && !hitting.includes(key)) {
      hitting.push(key);
    }

    if (category.type === "pitching" && key && !pitching.includes(key)) {
      pitching.push(key);
    }
  }

  return {
    hitting: hitting.length > 0 ? hitting : [...DEFAULT_HITTING_STATS],
    pitching: pitching.length > 0 ? pitching : [...DEFAULT_PITCHING_STATS],
  };
}

export function extractStatAbbreviation(value: string): string {
  const trimmed = value.trim();
  const inParens = trimmed.match(/\(([^)]+)\)$/)?.[1];
  return (inParens ?? trimmed).trim().toUpperCase();
}

export function poolApiToLabel(value: LeaguePlayerPool | undefined): PlayerPoolOption["label"] {
  if (value === "AL") return "AL-Only";
  if (value === "NL") return "NL-Only";
  return "Mixed MLB";
}

export function poolLabelToApi(label: PlayerPoolOption["label"]): LeaguePlayerPool {
  if (label === "AL-Only") return "AL";
  if (label === "NL-Only") return "NL";
  return "Mixed";
}

export function leagueSeasonYear(league: Pick<League, "seasonYear" | "createdAt">): number {
  if (typeof league.seasonYear === "number" && Number.isFinite(league.seasonYear)) {
    return league.seasonYear;
  }

  const created = new Date(league.createdAt);
  const year = created.getFullYear();
  return Number.isFinite(year) ? year : DEFAULT_SEASON_YEAR;
}

export function uniqueSeasonYears(leagues: readonly League[]): number[] {
  return Array.from(new Set(leagues.map(leagueSeasonYear))).sort((a, b) => b - a);
}

export function statusLabel(status: League["draftStatus"] | string): string {
  if (status === "pre-draft") return "Pre-draft";
  if (status === "in-progress") return "In progress";
  if (status === "completed") return "Completed";
  return String(status || "Unknown");
}

export function statusColor(status: League["draftStatus"] | string): string {
  if (status === "pre-draft") return "#60a5fa";
  if (status === "in-progress") return "#facc15";
  if (status === "completed") return "#34d399";
  return "#c4b5fd";
}

export function validateBaseLeagueForm(args: {
  name: string;
  teams: number;
  budget: number;
  rosterSlots: Record<string, number>;
  hittingStats: string[];
  pitchingStats: string[];
  posEligibilityThreshold: number;
}): string | null {
  if (!args.name.trim()) return "League name is required.";
  if (!Number.isInteger(args.teams) || args.teams < LEAGUE_TEAMS_MIN || args.teams > LEAGUE_TEAMS_MAX) {
    return `Team count must be between ${LEAGUE_TEAMS_MIN} and ${LEAGUE_TEAMS_MAX}.`;
  }
  if (!Number.isFinite(args.budget) || args.budget < 1) return "Budget must be at least $1.";
  if (!Number.isFinite(args.posEligibilityThreshold) || args.posEligibilityThreshold < 1) {
    return "Position eligibility must be at least 1 game.";
  }
  if (rosterSpotsTotal(args.rosterSlots) <= 0) return "Roster must have at least one slot.";
  if (args.hittingStats.length === 0) return "Select at least one hitting category.";
  if (args.pitchingStats.length === 0) return "Select at least one pitching category.";
  return null;
}
