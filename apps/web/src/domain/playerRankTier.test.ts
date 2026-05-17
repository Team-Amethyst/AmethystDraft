import { describe, expect, it } from "vitest";
import type { Player } from "../types/player";
import {
  displayAuctionTier,
  poolHasAuctionTier,
  tierBadgeTooltip,
} from "./playerRankTier";
import {
  AUCTION_TIER_TOOLTIP,
  MODEL_TIER_FALLBACK_TOOLTIP,
  MODEL_TIER_TOOLTIP,
} from "./rankTierLabels";

function p(partial: Partial<Player>): Player {
  return {
    id: "x",
    name: "Test",
    team: "TST",
    position: "OF",
    positions: ["OF"],
    headshot: "",
    catalog_rank: 1,
    catalog_tier: 2,
    stats: { batting: {}, pitching: {} },
    projection: { batting: {}, pitching: {} },
    ...partial,
  } as Player;
}

describe("poolHasAuctionTier", () => {
  it("is false when no player has auction_tier", () => {
    expect(poolHasAuctionTier([p({}), p({ catalog_tier: 3 })])).toBe(false);
  });

  it("is true when any player has finite auction_tier", () => {
    expect(poolHasAuctionTier([p({ auction_tier: 2 })])).toBe(true);
  });
});

describe("displayAuctionTier", () => {
  it("prefers auction_tier over catalog_tier", () => {
    expect(displayAuctionTier(p({ auction_tier: 4, catalog_tier: 1 }))).toBe(4);
  });

  it("falls back to catalog_tier", () => {
    expect(displayAuctionTier(p({ catalog_tier: 3 }))).toBe(3);
  });
});

describe("tierBadgeTooltip", () => {
  it("uses model tooltip when pool is not auction-tiered", () => {
    expect(tierBadgeTooltip(p({ catalog_tier: 2 }), false)).toBe(
      MODEL_TIER_TOOLTIP,
    );
  });

  it("uses auction tooltip when pool is auction-tiered and row has auction_tier", () => {
    expect(tierBadgeTooltip(p({ auction_tier: 2, catalog_tier: 1 }), true)).toBe(
      AUCTION_TIER_TOOLTIP,
    );
  });

  it("uses model fallback when pool is auction-tiered but row lacks auction_tier", () => {
    expect(tierBadgeTooltip(p({ catalog_tier: 3 }), true)).toBe(
      MODEL_TIER_FALLBACK_TOOLTIP,
    );
  });
});
