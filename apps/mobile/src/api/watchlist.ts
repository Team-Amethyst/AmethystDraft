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
): Promise<WatchlistPlayer> {
  return requestJson<WatchlistPlayer>(
    `/api/leagues/${leagueId}/watchlist`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(entry),
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
    `/api/leagues/${leagueId}/watchlist/${playerId}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
    "Failed to remove watchlist entry",
  );
}