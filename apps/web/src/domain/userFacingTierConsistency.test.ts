import { describe, expect, it } from "vitest";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import { commandCenterIdentityAuctionTier } from "./auctionCenterValuation";
import {
  displayTierForRaw,
  userFacingDisplayTier,
} from "./displayTiers";
import { userFacingDisplayTierForAvailablePlayer } from "./displayTiers";

function player(partial: Partial<Player> & { id: string }): Player {
  return {
    id: partial.id,
    mlbId: 1,
    name: partial.id,
    team: "SEA",
    position: "OF",
    age: 28,
    catalog_rank: 50,
    catalog_tier: 1,
    value: 1,
    headshot: "",
    stats: {},
    ...partial,
  } as Player;
}

describe("displayTierForRaw boundaries", () => {
  it("uses raw dollars, not rounded display", () => {
    expect(displayTierForRaw(25.1)).toBe(1);
    expect(displayTierForRaw(24.9)).toBe(2);
    expect(displayTierForRaw(15)).toBe(2);
    expect(displayTierForRaw(14.99)).toBe(3);
    expect(displayTierForRaw(9)).toBe(4);
    expect(displayTierForRaw(4.6)).toBe(5);
  });
});

describe("Research vs Command Center tier labels", () => {
  it("assigns the same T for the same auction_value", () => {
    const p = player({
      id: "x",
      auction_value: 16,
      auction_tier: 1,
      auction_rank: 200,
    });
    const row = {
      player_id: "x",
      auction_value: 16,
      auction_tier: 1,
    } as ValuationResult;

    const researchTier = userFacingDisplayTier(p);
    const cc = commandCenterIdentityAuctionTier(p, row, new Map([["x", 200]]), true);

    expect(researchTier).toBe(2);
    expect(cc.tierValue).toBe(2);
    expect(cc.engineTier).toBe(1);
  });

  it("maps $4 model value to T5 even when Engine tier is T1", () => {
    const p = player({ id: "cheap", auction_value: 4, auction_tier: 1 });
    expect(userFacingDisplayTier(p)).toBe(5);
    expect(userFacingDisplayTierForAvailablePlayer(p)).toBe(5);
    const cc = commandCenterIdentityAuctionTier(p, undefined, undefined, true);
    expect(cc.tierValue).toBe(5);
    expect(cc.engineTier).toBe(1);
  });

  it("maps $27 to T1 in Command Center", () => {
    const p = player({ id: "star", auction_value: 27, auction_tier: 3 });
    const cc = commandCenterIdentityAuctionTier(p, undefined, undefined, true);
    expect(cc.tierValue).toBe(1);
  });

  it("uses the same scaled bands in Research and Command Center", () => {
    const p = player({ id: "mid", auction_value: 49, auction_tier: 1 });
    const researchTier = userFacingDisplayTier(p, { leagueBudget: 520 });
    const cc = commandCenterIdentityAuctionTier(
      p,
      undefined,
      undefined,
      true,
      520,
    );
    expect(researchTier).toBe(2);
    expect(cc.tierValue).toBe(2);
  });
});
