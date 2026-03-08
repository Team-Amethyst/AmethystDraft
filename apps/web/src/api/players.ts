import type { Player } from "../types/player";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

interface PlayersResponse {
  players: Player[];
  count: number;
}

const playersCache = new Map<string, Player[]>();

export function getPlayersCached(
  sortBy: "adp" | "value" | "name" = "value",
): Player[] | null {
  return playersCache.get(sortBy) ?? null;
}

export async function getPlayers(
  sortBy: "adp" | "value" | "name" = "value",
): Promise<Player[]> {
  if (playersCache.has(sortBy)) {
    return playersCache.get(sortBy)!;
  }
  const query = new URLSearchParams({ sortBy });
  const res = await fetch(API_BASE + "/api/players?" + query.toString());
  const data = (await res.json()) as PlayersResponse;
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message || "Failed to fetch players",
    );
  }
  const players = data.players ?? [];
  playersCache.set(sortBy, players);
  return players;
}
