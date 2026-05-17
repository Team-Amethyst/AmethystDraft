import type { League } from "../contexts/LeagueContext";
import { authHeaders, requestJson, requestVoid } from "./client";

export interface CreateLeaguePayload {
  name: string;
  teams: number;
  budget: number;
  hitterBudgetPct?: number;
  rosterSlots: Record<string, number>;
  scoringFormat?: string;
  scoringCategories: { name: string; type: "batting" | "pitching" }[];
  playerPool: "Mixed" | "AL" | "NL";
  draftDate?: string;
  teamNames?: string[];
  posEligibilityThreshold?: number;
  seasonYear?: number;
  leagueFamilyId?: string;
}

export async function createLeague(
  data: CreateLeaguePayload,
  token: string,
): Promise<League> {
  return requestJson<League>(
    "/api/leagues",
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to create league",
  );
}

export type CreateLeagueFromCheckpointBody = {
  checkpoint_key:
    | "pre_draft"
    | "after_pick_10"
    | "after_pick_50"
    | "after_pick_100"
    | "after_pick_130"
    | "finished_league";
  name?: string;
  seasonYear?: number;
};

/** Persist league + roster from bundled Engine checkpoint (demo / QA). */
export async function createLeagueFromEngineCheckpoint(
  token: string,
  body: CreateLeagueFromCheckpointBody,
): Promise<League> {
  return requestJson<League>(
    "/api/leagues/from-engine-checkpoint",
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    "Failed to create league from checkpoint",
  );
}

export async function getMyLeagues(token: string): Promise<League[]> {
  return requestJson<League[]>(
    "/api/leagues",
    {
      headers: authHeaders(token),
    },
    "Failed to fetch leagues",
  );
}

export async function updateLeague(
  id: string,
  data: Partial<CreateLeaguePayload>,
  token: string,
): Promise<League> {
  return requestJson<League>(
    `/api/leagues/${id}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to update league",
  );
}

/** Commissioner only. Permanently removes the league and related roster / notes / watchlist data. */
export async function deleteLeague(id: string, token: string): Promise<void> {
  return requestVoid(
    `/api/leagues/${id}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
    "Failed to delete league",
  );
}

export type StartNewSeasonBody = {
  seasonYear?: number;
};

export async function startNewSeason(
  leagueId: string,
  body: StartNewSeasonBody,
  token: string,
): Promise<League> {
  return requestJson<League>(
    `/api/leagues/${leagueId}/start-new-season`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    "Failed to start new season",
  );
}

export type ImportKeepersBody = {
  fromLeagueId: string;
  teamMapping?: Record<string, string>;
};

export async function importKeepers(
  newLeagueId: string,
  body: ImportKeepersBody,
  token: string,
): Promise<{ imported: number }> {
  return requestJson<{ imported: number }>(
    `/api/leagues/${newLeagueId}/import-keepers`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    "Failed to import keepers",
  );
}
