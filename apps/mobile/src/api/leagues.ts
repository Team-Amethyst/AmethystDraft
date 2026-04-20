import { authHeaders, requestJson } from "./client";
import type { League } from "../types/league";

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

export async function getMyLeagues(token: string): Promise<League[]> {
  return requestJson<League[]>(
    "/api/leagues",
    {
      headers: authHeaders(token),
    },
    "Failed to fetch leagues",
  );
}