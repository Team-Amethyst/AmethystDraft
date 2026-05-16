import type { Player } from "../types/player";
import {
  AUCTION_TIER_TOOLTIP,
  MODEL_TIER_FALLBACK_TOOLTIP,
  MODEL_TIER_TOOLTIP,
} from "./rankTierLabels";

function finite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Prefer Engine auction tier, then catalog model tier. */
export function displayAuctionTier(p: Player): number | undefined {
  return finite(p.auction_tier) ?? finite(p.catalog_tier);
}

/** True when any player in the pool has a defined Engine auction tier (grouping is auction-first). */
export function poolHasAuctionTier(players: readonly Player[]): boolean {
  return players.some((p) => finite(p.auction_tier) !== undefined);
}

/** Tooltip for the tier badge / cell: auction definition vs per-row model fallback vs pure model column. */
export function tierBadgeTooltip(
  player: Player,
  poolUsesAuctionTier: boolean,
): string {
  if (poolUsesAuctionTier) {
    return finite(player.auction_tier) !== undefined
      ? AUCTION_TIER_TOOLTIP
      : MODEL_TIER_FALLBACK_TOOLTIP;
  }
  return MODEL_TIER_TOOLTIP;
}

/** Whether any player has external market ADP (show Market ADP column / sort). */
export function poolHasMarketAdp(players: readonly Player[]): boolean {
  return players.some((p) => finite(p.market_adp) !== undefined);
}

/** Whether valuation-derived ranks/tiers may exist (after board merge). */
export function playerHasAuctionRank(p: Player): boolean {
  return finite(p.auction_rank) !== undefined;
}
