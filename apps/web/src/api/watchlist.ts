import { authHeaders, requestJson, requestVoid } from "./client";

export interface WatchlistPlayer {
  id: string;
  /** Optional MLB player id to support matching against depth charts */
  mlbId?: number;
  name: string;
  team: string;
  position: string;
  positions?: string[];
  catalog_rank: number;
  value: number;
  catalog_tier: number;
  baseline_value?: number;
  auction_value?: number;
  recommended_bid?: number;
  team_value?: number;
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
        catalog_rank: player.catalog_rank,
        value: player.value,
        catalog_tier: player.catalog_tier,
        baseline_value: player.baseline_value,
        auction_value: player.auction_value,
        recommended_bid: player.recommended_bid,
        team_value: player.team_value,
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
