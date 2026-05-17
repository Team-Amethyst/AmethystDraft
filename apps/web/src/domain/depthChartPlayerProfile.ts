import type { DepthChartPlayerRow } from "../api/players";
import type { Player } from "../types/player";

export type DepthChartModalContext = {
  depthRank: 1 | 2 | 3;
  chartPosition: string;
  status: string;
};

const EMPTY_STATS = {};
const EMPTY_PROJECTION = {};

/**
 * Minimal catalog-shaped player for depth-chart-only modal (no Research catalog row).
 * Uses MLB id as `id` so roster/watchlist lookups stay stable when a catalog row appears later.
 */
export function buildDepthChartStubPlayer(
  slot: DepthChartPlayerRow,
  teamAbbr: string,
): Player {
  const injured = /injured|\bil\b/i.test(slot.status);
  return {
    id: String(slot.playerId),
    mlbId: slot.playerId,
    name: slot.playerName,
    team: teamAbbr,
    position: slot.primaryPosition,
    positions: [slot.primaryPosition],
    age: 0,
    catalog_rank: 0,
    catalog_tier: 0,
    value: 0,
    valuation_eligible: false,
    headshot: "",
    stats: EMPTY_STATS,
    projection: EMPTY_PROJECTION,
    outlook: "",
    injuryStatus: injured ? slot.status : undefined,
  };
}

export function depthChartModalContextFromRow(
  slot: DepthChartPlayerRow,
  chartPosition: string,
): DepthChartModalContext {
  return {
    depthRank: slot.rank,
    chartPosition,
    status: slot.status,
  };
}
