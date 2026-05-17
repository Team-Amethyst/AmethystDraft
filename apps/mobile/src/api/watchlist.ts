import { authHeaders, requestJson, requestVoid } from "./client";
import type { Player } from "../types/player";

export interface WatchlistPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  positions?: string[];

  adp: number;
  value: number;
  tier: number;

  catalog_rank?: number;
  catalog_tier?: number;
  baseline_value?: number;
  auction_value?: number;
  recommended_bid?: number;
  team_value?: number;
}

export function playerToWatchlistEntry(player: Player): WatchlistPlayer {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    positions: player.positions,

    adp: player.adp,
    value: player.value,
    tier: player.tier,

    catalog_rank: player.adp,
    catalog_tier: player.tier,
  };
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
  entry: WatchlistPlayer,
  token: string,
): Promise<void> {
  return requestVoid(
    `/api/leagues/${leagueId}/watchlist/${encodeURIComponent(entry.id)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: entry.name,
        team: entry.team,
        position: entry.position,
        positions: entry.positions,

        adp: entry.adp,
        value: entry.value,
        tier: entry.tier,

        catalog_rank: entry.catalog_rank ?? entry.adp,
        catalog_tier: entry.catalog_tier ?? entry.tier,
        baseline_value: entry.baseline_value,
        auction_value: entry.auction_value,
        recommended_bid: entry.recommended_bid,
        team_value: entry.team_value,
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