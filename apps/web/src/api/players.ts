import type { Player } from "../types/player";
import { requestJson } from "./client";

interface PlayersResponse {
  players: Player[];
  count: number;
}

export type DepthChartPosition =
  | "SP"
  | "RP"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "CF"
  | "RF"
  | "DH";

export interface DepthChartPlayerRow {
  rank: 1 | 2 | 3;
  playerId: number;
  playerName: string;
  primaryPosition: string;
  status: string;
  usageStarts: number;
  usageAppearances: number;
  outOfPosition: boolean;
  needsManualReview: boolean;
  reasons: string[];
}

export interface DepthChartResponse {
  teamId: number;
  generatedAt: string;
  season: number;
  rosterCount: number;
  rosterLimit: 26 | 28;
  positions: Record<DepthChartPosition, DepthChartPlayerRow[]>;
  manualReview: Array<{
    playerId: number;
    playerName: string;
    requestedPosition: DepthChartPosition;
    reason: string;
  }>;
  constraints: {
    rosterLimitRespected: boolean;
    note: string;
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const playersCache = new Map<string, Player[]>();
const playersCacheTime = new Map<string, number>();
const DEPTH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const depthChartCache = new Map<string, DepthChartResponse>();
const depthChartCacheTime = new Map<string, number>();

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

export function getDepthChartCached(
  teamId: number,
  season?: number,
): DepthChartResponse | null {
  const cacheKey = `${teamId}-${season ?? "current"}`;
  const ts = depthChartCacheTime.get(cacheKey);
  if (ts && Date.now() - ts < DEPTH_CACHE_TTL_MS) {
    return depthChartCache.get(cacheKey) ?? null;
  }
  return null;
}

export async function getTeamDepthChart(
  teamId: number,
  season?: number,
  forceRefresh = false,
): Promise<DepthChartResponse> {
  const cacheKey = `${teamId}-${season ?? "current"}`;
  const ts = depthChartCacheTime.get(cacheKey);
  if (!forceRefresh && ts && Date.now() - ts < DEPTH_CACHE_TTL_MS && depthChartCache.has(cacheKey)) {
    return depthChartCache.get(cacheKey)!;
  }

  const query = new URLSearchParams();
  if (season !== undefined) {
    query.set("season", String(season));
  }
  if (forceRefresh) {
    query.set("refresh", "1");
  }
  const queryString = query.size > 0 ? `?${query.toString()}` : "";

  const data = await requestJson<DepthChartResponse>(
    `/api/players/depth-chart/${teamId}${queryString}`,
    {},
    "Failed to fetch MLB depth chart",
  );
  depthChartCache.set(cacheKey, data);
  depthChartCacheTime.set(cacheKey, Date.now());
  return data;
}
