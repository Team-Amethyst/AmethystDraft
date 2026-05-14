import { authHeaders, requestJson, requestVoid } from "./client";

const rosterCache = new Map<string, RosterEntry[]>();

export function getRosterCached(leagueId: string): RosterEntry[] | null {
  return rosterCache.get(leagueId) ?? null;
}

export function setRosterCache(leagueId: string, entries: RosterEntry[]): void {
  rosterCache.set(leagueId, entries);
}

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
  keeperContract?: string;
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
  keeperContract?: string;
  userId?: string;
  teamId?: string;
}

export async function getRoster(
  leagueId: string,
  token: string,
): Promise<RosterEntry[]> {
  const entries = await requestJson<RosterEntry[]>(
    `/api/leagues/${leagueId}/roster`,
    {
      headers: authHeaders(token),
    },
    "Failed to fetch roster",
  );

  setRosterCache(leagueId, entries);
  return entries;
}

export async function addRosterEntry(
  leagueId: string,
  data: RosterEntryPayload,
  token: string,
): Promise<RosterEntry> {
  const entry = await requestJson<RosterEntry>(
    `/api/leagues/${leagueId}/roster`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to add roster entry",
  );

  const cached = rosterCache.get(leagueId);
  if (cached) {
    setRosterCache(leagueId, [...cached, entry]);
  }

  return entry;
}

export async function updateRosterEntry(
  leagueId: string,
  entryId: string,
  data: {
    price?: number;
    rosterSlot?: string;
    teamId?: string;
    keeperContract?: string;
  },
  token: string,
): Promise<RosterEntry> {
  const entry = await requestJson<RosterEntry>(
    `/api/leagues/${leagueId}/roster/${entryId}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to update roster entry",
  );

  const cached = rosterCache.get(leagueId);
  if (cached) {
    setRosterCache(
      leagueId,
      cached.map((item) => (item._id === entryId ? entry : item)),
    );
  }

  return entry;
}

export async function removeRosterEntry(
  leagueId: string,
  entryId: string,
  token: string,
): Promise<void> {
  await requestVoid(
    `/api/leagues/${leagueId}/roster/${entryId}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
    "Failed to remove roster entry",
  );

  const cached = rosterCache.get(leagueId);
  if (cached) {
    setRosterCache(
      leagueId,
      cached.filter((item) => item._id !== entryId),
    );
  }
}