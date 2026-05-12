import type { Player } from "../types/player";
import {
  hasPitcherEligibility,
  normalizePlayerPositions,
} from "../utils/eligibility";

function hasFiniteMarketAdp(p: Player): boolean {
  return typeof p.market_adp === "number" && Number.isFinite(p.market_adp);
}

/**
 * Default Research player-database list:
 * - Always show `valuation_eligible` (and legacy rows with no `catalog_kind`).
 * - Show `market_only` only when Market ADP is present.
 * - Hide `roster_context` until an explicit widen (e.g. query) is added later.
 */
export function filterResearchDefaultCatalogKind(players: Player[]): Player[] {
  return players.filter((p) => {
    if (p.catalog_kind === "roster_context") return false;
    if (p.catalog_kind === "market_only") return hasFiniteMarketAdp(p);
    return true;
  });
}

/**
 * Research “player database” list filter: substring on name and optional position filter.
 * Pitcher filter uses eligibility helper; OF matches any outfield eligibility.
 */
export function filterResearchCatalogPlayers(
  players: Player[],
  searchQuery: string,
  positionFilter: string,
): Player[] {
  const q = searchQuery.toLowerCase();
  return players.filter((player) => {
    const playerName = player.name?.toLowerCase() ?? "";
    const matchesSearch = playerName.includes(q);
    const matchesPosition =
      positionFilter === "all" ||
      (() => {
        const allPos = normalizePlayerPositions(
          player.positions,
          player.position,
        );
        if (positionFilter === "P") {
          return hasPitcherEligibility(player.positions, player.position);
        }
        if (positionFilter === "OF") {
          return allPos.includes("OF");
        }
        return allPos.includes(positionFilter);
      })();
    return matchesSearch && matchesPosition;
  });
}
