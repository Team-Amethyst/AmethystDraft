import { authHeaders, requestJson, requestVoid } from "./client";

export interface WatchlistPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  positions?: string[];
  adp: number;
  value: number;
  tier: number;
  baseline_value?: number;
  adjusted_value?: number;
  recommended_bid?: number;
  team_adjusted_value?: number;
}

export async function getWatchlist(
  leagueId: string,
  token: string,
): Promise<WatchlistPlayer[]> {
  return requestJson<WatchlistPlayer[]>(
    `/api/leagues/${leagueId}/watchlist`,
    {
      headers: authHeaders(token),
    },
    "Failed to fetch watchlist",
  );
}

export async function addWatchlistEntry(
  leagueId: string,
  player: WatchlistPlayer,
  token: string,
): Promise<void> {
  return requestVoid(
    `/api/leagues/${leagueId}/watchlist/${encodeURIComponent(player.id)}`,
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
        baseline_value: player.baseline_value,
        adjusted_value: player.adjusted_value,
        recommended_bid: player.recommended_bid,
        team_adjusted_value: player.team_adjusted_value,
      }),
    },
    "Failed to add watchlist entry",
  );
}

export async function deleteWatchlistEntry(
  leagueId: string,
  playerId: string,
  token: string,
): Promise<void> {
  return requestVoid(
    `/api/leagues/${leagueId}/watchlist/${encodeURIComponent(playerId)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
    "Failed to remove watchlist entry",
  );
}
