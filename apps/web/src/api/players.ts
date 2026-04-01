import type { Player } from "../types/player";
import { requestJson } from "./client";

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
  const data = await requestJson<PlayersResponse>(
    "/api/players?" + query.toString(),
    {},
    "Failed to fetch players",
  );
  const players = data.players ?? [];
  playersCache.set(cacheKey, players);
  playersCacheTime.set(cacheKey, Date.now());
  return players;
}
