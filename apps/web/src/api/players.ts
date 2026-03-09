import type { Player } from "../types/player";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface PlayersResponse {
  players: Player[];
  count: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const playersCache = new Map<string, Player[]>();
const playersCacheTime = new Map<string, number>();

export function getPlayersCached(
  sortBy: "adp" | "value" | "name" = "value",
  posEligibilityThreshold?: number,
  playerPool?: "Mixed" | "AL" | "NL",
): Player[] | null {
  const cacheKey = `${sortBy}-${posEligibilityThreshold ?? 20}-${playerPool ?? "Mixed"}`;
  const ts = playersCacheTime.get(cacheKey);
  if (ts && Date.now() - ts < CACHE_TTL_MS) {
    return playersCache.get(cacheKey) ?? null;
  }
  return null;
}

export async function getPlayers(
  sortBy: "adp" | "value" | "name" = "value",
  posEligibilityThreshold?: number,
  playerPool?: "Mixed" | "AL" | "NL",
): Promise<Player[]> {
  const cacheKey = `${sortBy}-${posEligibilityThreshold ?? 20}-${playerPool ?? "Mixed"}`;
  const ts = playersCacheTime.get(cacheKey);
  if (ts && Date.now() - ts < CACHE_TTL_MS && playersCache.has(cacheKey)) {
    return playersCache.get(cacheKey)!;
  }
  const query = new URLSearchParams({ sortBy });
  if (posEligibilityThreshold !== undefined) {
    query.set("posEligibilityThreshold", String(posEligibilityThreshold));
  }
  if (playerPool && playerPool !== "Mixed") {
    query.set("playerPool", playerPool);
  }
  const res = await fetch(API_BASE + "/api/players?" + query.toString());
  const data = (await res.json()) as PlayersResponse;
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message || "Failed to fetch players",
    );
  }
  const players = data.players ?? [];
  playersCache.set(cacheKey, players);
  playersCacheTime.set(cacheKey, Date.now());
  return players;
}
