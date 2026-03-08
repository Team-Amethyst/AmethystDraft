const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface WatchlistPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  positions?: string[];
  adp: number;
  value: number;
  tier: number;
}

export async function getWatchlist(
  leagueId: string,
  token: string,
): Promise<WatchlistPlayer[]> {
  const res = await fetch(`${API_BASE}/api/leagues/${leagueId}/watchlist`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch watchlist");
  return res.json() as Promise<WatchlistPlayer[]>;
}

export async function addWatchlistEntry(
  leagueId: string,
  player: WatchlistPlayer,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/leagues/${leagueId}/watchlist/${encodeURIComponent(player.id)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: player.name,
        team: player.team,
        position: player.position,
        positions: player.positions,
        adp: player.adp,
        value: player.value,
        tier: player.tier,
      }),
    },
  );
  if (!res.ok) throw new Error("Failed to add watchlist entry");
}

export async function deleteWatchlistEntry(
  leagueId: string,
  playerId: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/leagues/${leagueId}/watchlist/${encodeURIComponent(playerId)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
  if (!res.ok) throw new Error("Failed to remove watchlist entry");
}
