import type { League } from "../contexts/LeagueContext";
import { authHeaders, requestJson } from "./client";

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
