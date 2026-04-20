import { authHeaders, requestJson, requestVoid } from "./client";

export interface RosterEntry {
  _id: string;
  leagueId: string;
  userId: string;
  teamId: string;
  externalPlayerId: string;
  playerName: string;
  playerTeam: string;
  positions: string[];
  price: number;
  rosterSlot: string;
  isKeeper: boolean;
  acquiredAt: string;
  createdAt: string;
}

export interface RosterEntryPayload {
  externalPlayerId: string;
  playerName: string;
  playerTeam?: string;
  positions?: string[];
  price: number;
  rosterSlot: string;
  isKeeper?: boolean;
  userId?: string;
  teamId?: string;
}

export async function getRoster(
  leagueId: string,
  token: string,
): Promise<RosterEntry[]> {
  return requestJson<RosterEntry[]>(
    `/api/leagues/${leagueId}/roster`,
    {
      headers: authHeaders(token),
    },
    "Failed to fetch roster",
  );
}

export async function addRosterEntry(
  leagueId: string,
  data: RosterEntryPayload,
  token: string,
): Promise<RosterEntry> {
  return requestJson<RosterEntry>(
    `/api/leagues/${leagueId}/roster`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to add roster entry",
  );
}

export async function updateRosterEntry(
  leagueId: string,
  entryId: string,
  data: { price?: number; rosterSlot?: string; teamId?: string },
  token: string,
): Promise<RosterEntry> {
  return requestJson<RosterEntry>(
    `/api/leagues/${leagueId}/roster/${entryId}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to update roster entry",
  );
}

export async function removeRosterEntry(
  leagueId: string,
  entryId: string,
  token: string,
): Promise<void> {
  return requestVoid(
    `/api/leagues/${leagueId}/roster/${entryId}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
    "Failed to remove roster entry",
  );
}