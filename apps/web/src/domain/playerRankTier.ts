import type { Player } from "../types/player";

function finite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Prefer Engine auction tier, then catalog model tier. */
export function displayAuctionTier(p: Player): number | undefined {
  return finite(p.auction_tier) ?? finite(p.catalog_tier);
}

/** Whether any player has external market ADP (show Market ADP column / sort). */
export function poolHasMarketAdp(players: readonly Player[]): boolean {
  return players.some((p) => finite(p.market_adp) !== undefined);
}

/** Whether valuation-derived ranks/tiers may exist (after board merge). */
export function playerHasAuctionRank(p: Player): boolean {
  return finite(p.auction_rank) !== undefined;
}
