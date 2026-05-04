import type { Player } from "../types/player";
import {
  hasPitcherEligibility,
  normalizePlayerPositions,
} from "../utils/eligibility";

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
