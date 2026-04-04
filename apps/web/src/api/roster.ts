import { authHeaders, requestJson, requestVoid } from "./client";

// ─── Roster cache ─────────────────────────────────────────────────────────────
// Keyed by leagueId. Allows consumers to seed state synchronously on mount and
// revalidate in the background, eliminating the visual flicker where all players
// appear un-drafted until the network round-trip completes.
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
  if (cached) setRosterCache(leagueId, [...cached, entry]);
  return entry;
}

export async function updateRosterEntry(
  leagueId: string,
  entryId: string,
  data: { price?: number; rosterSlot?: string; teamId?: string },
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
    setRosterCache(leagueId, cached.map((e) => (e._id === entryId ? entry : e)));
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
  if (cached) setRosterCache(leagueId, cached.filter((e) => e._id !== entryId));
}
