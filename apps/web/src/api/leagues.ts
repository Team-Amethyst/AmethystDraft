import type { League } from "../contexts/LeagueContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function createLeague(
  data: CreateLeaguePayload,
  token: string,
): Promise<League> {
  const res = await fetch(`${API_BASE}/api/leagues`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to create league");
  return json as League;
}

export async function getMyLeagues(token: string): Promise<League[]> {
  const res = await fetch(`${API_BASE}/api/leagues`, {
    headers: authHeaders(token),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to fetch leagues");
  return json as League[];
}

export async function updateLeague(
  id: string,
  data: Partial<CreateLeaguePayload>,
  token: string,
): Promise<League> {
  const res = await fetch(`${API_BASE}/api/leagues/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to update league");
  return json as League;
}
