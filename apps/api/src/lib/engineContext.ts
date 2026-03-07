import type { ILeague } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";

export interface EngineRosterSlot {
  position: string;
  count: number;
}

export interface EngineScoringCategory {
  name: string;
  type: "batting" | "pitching";
}

export interface EngineDraftedPlayer {
  player_id: string;
  name: string;
  position: string;
  team: string;
  team_id: string;
  paid?: number;
}

export interface EngineValuationContext {
  roster_slots: EngineRosterSlot[];
  scoring_categories: EngineScoringCategory[];
  total_budget: number;
  num_teams: number;
  league_scope: "Mixed" | "AL" | "NL";
  drafted_players: EngineDraftedPlayer[];
}

export interface EngineTeamState {
  team_id: string;
  budget_remaining: number;
  roster: EngineDraftedPlayer[];
}

export interface EngineSimulationContext {
  pick_order: string[];
  roster_slots: EngineRosterSlot[];
  league_scope: "Mixed" | "AL" | "NL";
  teams: EngineTeamState[];
  available_player_ids?: string[];
}

/**
 * Converts stored roster entries to the DraftedPlayer shape the engine expects.
 * team_id is derived from the player's teamId field (set at draft time).
 */
function toDraftedPlayers(entries: IRosterEntry[]): EngineDraftedPlayer[] {
  return entries.map((e) => ({
    player_id: e.externalPlayerId,
    name: e.playerName,
    position: e.positions[0] ?? e.rosterSlot,
    team: e.playerTeam,
    team_id: e.teamId,
    paid: e.price,
  }));
}

/**
 * Builds the full context object for /valuation/calculate and /analysis/scarcity.
 */
export function buildValuationContext(
  league: ILeague,
  rosterEntries: IRosterEntry[],
): EngineValuationContext {
  const rosterSlots = Object.entries(league.rosterSlots).map(
    ([position, count]) => ({ position, count }),
  );

  return {
    roster_slots: rosterSlots,
    scoring_categories: league.scoringCategories,
    total_budget: league.budget,
    num_teams: league.teams,
    league_scope: league.playerPool,
    drafted_players: toDraftedPlayers(rosterEntries),
  };
}

/**
 * Builds the context for /simulation/mock-pick.
 * budgetByTeamId maps team_id → budget_remaining (pass current auction state).
 */
export function buildSimulationContext(
  league: ILeague,
  rosterEntries: IRosterEntry[],
  budgetByTeamId: Record<string, number>,
  availablePlayerIds?: string[],
): EngineSimulationContext {
  const rosterSlots = Object.entries(league.rosterSlots).map(
    ([position, count]) => ({ position, count }),
  );

  const teamIds = league.memberIds.map((_, i) => `team_${i + 1}`);

  const teams: EngineTeamState[] = teamIds.map((teamId) => {
    const teamRoster = rosterEntries.filter((e) => e.teamId === teamId);
    return {
      team_id: teamId,
      budget_remaining: budgetByTeamId[teamId] ?? league.budget,
      roster: toDraftedPlayers(teamRoster),
    };
  });

  return {
    pick_order: teamIds,
    roster_slots: rosterSlots,
    league_scope: league.playerPool,
    teams,
    ...(availablePlayerIds ? { available_player_ids: availablePlayerIds } : {}),
  };
}

/**
 * Derives team_id from a userId string and the league's memberIds array.
 * This is the canonical conversion used everywhere.
 */
export function userIdToTeamId(
  userId: string,
  memberIds: { toString(): string }[],
): string {
  const index = memberIds.findIndex((id) => id.toString() === userId);
  return index >= 0 ? `team_${index + 1}` : "team_unknown";
}
