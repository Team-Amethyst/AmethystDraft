/** Mirrors `createLeagueSchema` / `updateLeagueSchema` in apps/api/src/validation/schemas.ts */

export const LEAGUE_TEAMS_MIN = 2;
export const LEAGUE_TEAMS_MAX = 30;

const PLAYER_POOL_VALUES = ["Mixed", "AL", "NL"] as const;

export interface LeaguePayloadInput {
  name: string;
  teams: number;
  budget: number;
  posEligibilityThreshold?: number;
  rosterSlots?: Record<string, number>;
  scoringCategories?: { name: string; type: string }[];
  playerPool?: string;
}

export type LeagueValidationResult =
  | { valid: true }
  | { valid: false; message: string; fieldErrors: Record<string, string> };

function formatFieldErrors(fieldErrors: Record<string, string>): string {
  return Object.entries(fieldErrors)
    .map(([field, message]) => `${field}: ${message}`)
    .join("; ");
}

export function validateLeaguePayload(
  input: LeaguePayloadInput,
): LeagueValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (!input.name?.trim()) {
    fieldErrors.name = "League name is required";
  }

  if (!Number.isFinite(input.teams) || !Number.isInteger(input.teams)) {
    fieldErrors.teams = "Teams must be a whole number";
  } else if (input.teams < LEAGUE_TEAMS_MIN) {
    fieldErrors.teams = `League must have at least ${LEAGUE_TEAMS_MIN} teams`;
  } else if (input.teams > LEAGUE_TEAMS_MAX) {
    fieldErrors.teams = `League cannot have more than ${LEAGUE_TEAMS_MAX} teams`;
  }

  if (!Number.isFinite(input.budget) || input.budget <= 0) {
    fieldErrors.budget = "Budget must be greater than 0";
  }

  if (input.posEligibilityThreshold !== undefined) {
    if (
      !Number.isFinite(input.posEligibilityThreshold) ||
      !Number.isInteger(input.posEligibilityThreshold) ||
      input.posEligibilityThreshold < 1
    ) {
      fieldErrors.posEligibilityThreshold = "Must be at least 1";
    }
  }

  if (input.playerPool !== undefined) {
    if (
      !PLAYER_POOL_VALUES.includes(
        input.playerPool as (typeof PLAYER_POOL_VALUES)[number],
      )
    ) {
      fieldErrors.playerPool = "Player pool must be Mixed, AL, or NL";
    }
  }

  if (input.rosterSlots) {
    for (const [slot, count] of Object.entries(input.rosterSlots)) {
      if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
        fieldErrors[`rosterSlots.${slot}`] = "Must be 0 or more";
      }
    }
  }

  for (const [index, cat] of (input.scoringCategories ?? []).entries()) {
    if (!cat.name?.trim()) {
      fieldErrors[`scoringCategories.${index}.name`] = "Category name is required";
    }
    if (cat.type !== "batting" && cat.type !== "pitching") {
      fieldErrors[`scoringCategories.${index}.type`] =
        "Category type must be batting or pitching";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      fieldErrors,
      message: formatFieldErrors(fieldErrors),
    };
  }

  return { valid: true };
}

export function leaguePayloadFromCreateForm(args: {
  leagueName: string;
  teams: number;
  budget: number;
  posEligibilityThreshold: number;
  rosterSlots: Record<string, number>;
  scoringCategories: { name: string; type: "batting" | "pitching" }[];
  playerPool: string;
}): LeaguePayloadInput {
  return {
    name: args.leagueName,
    teams: args.teams,
    budget: args.budget,
    posEligibilityThreshold: args.posEligibilityThreshold,
    rosterSlots: args.rosterSlots,
    scoringCategories: args.scoringCategories,
    playerPool: args.playerPool,
  };
}
