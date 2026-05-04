import type { WatchlistPlayer } from "../api/watchlist";
import type { Player } from "../types/player";

/**
 * Minimal `Player` shape for code paths that only have watchlist API rows
 * (e.g. My Draft valuation merge). Not suitable for full catalog features.
 */
export function playerFromWatchlistEntry(p: WatchlistPlayer): Player {
  return {
    id: p.id,
    mlbId: 0,
    name: p.name,
    team: p.team,
    position: p.position,
    positions: p.positions,
    age: 0,
    adp: p.adp,
    value: p.value,
    tier: p.tier,
    baseline_value: p.baseline_value,
    adjusted_value: p.adjusted_value,
    recommended_bid: p.recommended_bid,
    team_adjusted_value: p.team_adjusted_value,
    headshot: "",
    outlook: "",
    stats: {},
    projection: {},
  };
}
