const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function getRoster(
  leagueId: string,
  token: string,
): Promise<RosterEntry[]> {
  const res = await fetch(`${API_BASE}/api/leagues/${leagueId}/roster`, {
    headers: authHeaders(token),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to fetch roster");
  return json as RosterEntry[];
}

export async function addRosterEntry(
  leagueId: string,
  data: RosterEntryPayload,
  token: string,
): Promise<RosterEntry> {
  const res = await fetch(`${API_BASE}/api/leagues/${leagueId}/roster`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to add roster entry");
  return json as RosterEntry;
}

export async function removeRosterEntry(
  leagueId: string,
  entryId: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/leagues/${leagueId}/roster/${entryId}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || "Failed to remove roster entry");
  }
}
