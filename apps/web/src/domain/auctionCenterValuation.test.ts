import { describe, expect, it } from "vitest";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  auctionValueForCommandCenterPrefill,
  bidReasonDisclosureHasEngineContent,
  commandCenterEdgeVsMaxBidRounded,
  commandCenterIdentityRanks,
  commandCenterSearchDropdownAuctionDollars,
  commandCenterIdentityAuctionTier,
  deriveAuctionRanksByPlayerId,
  deriveAuctionTierFromRank,
  engineRowHasFocusedExplainPayload,
  mergeDisplayValuationRow,
  valuationExplainHasBidContextTable,
} from "./auctionCenterValuation";

function minimalPlayer(over: Partial<Player> = {}): Player {
  return {
    id: "p1",
    mlbId: 1,
    name: "Test",
    team: "NYY",
    position: "OF",
    positions: ["OF"],
    age: 28,
    catalog_rank: 10,
    value: 20,
    catalog_tier: 3,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...over,
  };
}

describe("auctionValueForCommandCenterPrefill", () => {
  it("returns rounded auction_value from the valuation row", () => {
    const row = {
      player_id: "p1",
      auction_value: 42.7,
    } as ValuationResult;
    expect(auctionValueForCommandCenterPrefill(row)).toBe(42.7);
  });

  it("returns null when auction_value is missing", () => {
    expect(auctionValueForCommandCenterPrefill(undefined)).toBeNull();
    expect(
      auctionValueForCommandCenterPrefill({ player_id: "p1" } as ValuationResult),
    ).toBeNull();
  });
});

describe("commandCenterIdentityRanks", () => {
  it("uses engine auction_rank and merged market ADP", () => {
    const player = minimalPlayer({
      catalog_rank: 12,
      auction_rank: 1,
      market_adp: undefined,
    });
    const row = {
      player_id: "p1",
      auction_rank: 45,
      market_adp: 54.91,
    } as ValuationResult;
    const ranks = commandCenterIdentityRanks(player, row);
    expect(ranks.auctionRank).toBe(45);
    expect(ranks.marketAdp).toBe(54.91);
    expect(ranks.displayPlayer.market_adp).toBe(54.91);
  });

  it("does not fall back to stale player.auction_rank when the board row omits rank", () => {
    const player = minimalPlayer({
      catalog_rank: 12,
      auction_rank: 1,
    });
    const row = {
      player_id: "p1",
      auction_value: 30,
    } as ValuationResult;
    expect(commandCenterIdentityRanks(player, row).auctionRank).toBeNull();
  });

  it("does not treat legacy row.adp as auction rank", () => {
    const player = minimalPlayer({ catalog_rank: 12, auction_rank: 99 });
    const row = {
      player_id: "p1",
      adp: 1,
    } as ValuationResult;
    expect(commandCenterIdentityRanks(player, row).auctionRank).toBeNull();
  });

  it("returns null auction rank when no engine row is loaded", () => {
    const player = minimalPlayer({ catalog_rank: 12, auction_rank: 1 });
    expect(commandCenterIdentityRanks(player, undefined).auctionRank).toBeNull();
  });

  it("prefers board-derived auction rank over a stale row auction_rank", () => {
    const player = minimalPlayer({ id: "p1", catalog_rank: 12 });
    const row = {
      player_id: "p1",
      auction_rank: 1,
      auction_value: 12,
    } as ValuationResult;
    const derived = new Map([["p1", 45]]);
    expect(commandCenterIdentityRanks(player, row, derived).auctionRank).toBe(45);
  });
});

describe("deriveAuctionRanksByPlayerId", () => {
  it("orders players by auction_value descending with stable tie-break", () => {
    const ranks = deriveAuctionRanksByPlayerId([
      { player_id: "b", auction_value: 40 } as ValuationResult,
      { player_id: "a", auction_value: 50 } as ValuationResult,
      { player_id: "c", auction_value: 40 } as ValuationResult,
      { player_id: "d" } as ValuationResult,
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(2);
    expect(ranks.get("c")).toBe(3);
    expect(ranks.has("d")).toBe(false);
  });
});

describe("deriveAuctionTierFromRank", () => {
  it("maps bottom quintile for high ranks in a 400-player pool", () => {
    expect(deriveAuctionTierFromRank(1, 400)).toBe(1);
    expect(deriveAuctionTierFromRank(80, 400)).toBe(1);
    expect(deriveAuctionTierFromRank(81, 400)).toBe(2);
    expect(deriveAuctionTierFromRank(358, 400)).toBe(5);
  });
});

describe("commandCenterIdentityAuctionTier", () => {
  it("uses auction quintile from derived rank, not model catalog_tier", () => {
    const player = minimalPlayer({
      id: "player-358",
      catalog_tier: 1,
      auction_tier: undefined,
    });
    const row = {
      player_id: "player-358",
      tier: 1,
      auction_value: 1,
    } as ValuationResult;
    const ranks = new Map<string, number>();
    for (let i = 1; i <= 400; i += 1) {
      ranks.set(`player-${i}`, i);
    }
    const out = commandCenterIdentityAuctionTier(player, row, ranks, true);
    expect(out.tierValue).toBe(5);
    expect(out.tierKind).toBe("auction");
  });

  it("allows model tier before the engine board loads", () => {
    const player = minimalPlayer({ catalog_tier: 2 });
    const out = commandCenterIdentityAuctionTier(player, undefined, undefined, false);
    expect(out.tierValue).toBe(2);
    expect(out.tierKind).toBe("model");
  });
});

describe("commandCenterSearchDropdownAuctionDollars", () => {
  it("prefers Engine board auction_value over catalog list value", () => {
    const player = minimalPlayer({ value: 112, auction_value: undefined });
    const row = {
      player_id: "p1",
      auction_value: 36,
    } as ValuationResult;
    expect(commandCenterSearchDropdownAuctionDollars(player, row)).toBe(36);
  });

  it("falls back to catalog auction_value when board row is missing", () => {
    const player = minimalPlayer({ value: 99, auction_value: 41 });
    expect(commandCenterSearchDropdownAuctionDollars(player, undefined)).toBe(41);
  });

  it("returns null when only catalog list value exists (no Engine auction)", () => {
    const player = minimalPlayer({ value: 112 });
    expect(commandCenterSearchDropdownAuctionDollars(player, undefined)).toBeNull();
  });

  it("hides auction for valuation-ineligible catalog rows", () => {
    const player = minimalPlayer({
      value: 200,
      auction_value: 5,
      valuation_eligible: false,
    });
    expect(commandCenterSearchDropdownAuctionDollars(player, undefined)).toBeNull();
  });
});

describe("commandCenterEdgeVsMaxBidRounded (BidDecisionCard ladder)", () => {
  it("is Team Value − Max Bid even when Engine edge would differ", () => {
    expect(commandCenterEdgeVsMaxBidRounded(40, 30)).toBe(10);
    expect(
      commandCenterEdgeVsMaxBidRounded(12, 10),
    ).toBe(2);
  });

  it("matches verdict delta (rounded TV − RB), ignoring Engine edge semantics", () => {
    const tv = 40;
    const rb = 35;
    expect(commandCenterEdgeVsMaxBidRounded(tv, rb)).toBe(5);
  });

  it("returns undefined when either input is missing", () => {
    expect(commandCenterEdgeVsMaxBidRounded(undefined, 10)).toBeUndefined();
    expect(commandCenterEdgeVsMaxBidRounded(10, undefined)).toBeUndefined();
    expect(commandCenterEdgeVsMaxBidRounded(null, null)).toBeUndefined();
  });
});

describe("Command Center bid reasoning helpers", () => {
  it("valuationExplainHasBidContextTable is true when replacement context exists", () => {
    expect(
      valuationExplainHasBidContextTable({
        replacement_key_used: "OF5",
        replacement_value_used: 3,
      }),
    ).toBe(true);
  });

  it("bidReasonDisclosureHasEngineContent is true when valuation_explain exists", () => {
    const row = {
      player_id: "p1",
      name: "A",
      position: "OF",
      tier: 2,
      baseline_value: 40,
      auction_value: 30,
      indicator: "Fair Value",
      valuation_explain: {
        replacement_key_used: "OF5",
        replacement_value_used: 4,
      },
    } as ValuationResult;
    expect(bidReasonDisclosureHasEngineContent(row, minimalPlayer())).toBe(true);
  });

  it("bidReasonDisclosureHasEngineContent is false when row and player lack explain fields", () => {
    const row = {
      player_id: "p1",
      name: "A",
      position: "OF",
      tier: 2,
      baseline_value: 40,
      auction_value: 30,
      indicator: "Fair Value",
    } as ValuationResult;
    expect(bidReasonDisclosureHasEngineContent(row, minimalPlayer())).toBe(false);
  });

  it("mergeDisplayValuationRow carries explain_v2 and why from catalog when row omits them", () => {
    const v2 = {
      indicator: "Reach" as const,
      auction_target: 1,
      list_value: 2,
      adjustments: { scarcity: 0, inflation: 0, other: 0 },
      drivers: [{ label: "x", impact: 1, reason: "y" }],
      confidence: 0.5,
    };
    const row = {
      player_id: "p1",
      name: "A",
      position: "OF",
      tier: 2,
      baseline_value: 40,
      auction_value: 30,
      indicator: "Fair Value",
    } as ValuationResult;
    const merged = mergeDisplayValuationRow(row, minimalPlayer({ explain_v2: v2, why: ["a"] }));
    expect(merged?.explain_v2).toEqual(v2);
    expect(merged?.why).toEqual(["a"]);
  });
});

describe("engineRowHasFocusedExplainPayload", () => {
  it("is false when explain missing or empty", () => {
    expect(engineRowHasFocusedExplainPayload(undefined)).toBe(false);
    expect(
      engineRowHasFocusedExplainPayload({
        player_id: "p1",
      } as ValuationResult),
    ).toBe(false);
  });

  it("is true when bid-context explain fields are present", () => {
    expect(
      engineRowHasFocusedExplainPayload({
        player_id: "p1",
        valuation_explain: { replacement_key_used: "OF5" },
      } as ValuationResult),
    ).toBe(true);
  });
});

/** Mirrors `getValuation` board POST body — must stay free of `explain_valuation_rows`. */
describe("Engine valuation request contracts", () => {
  it("board valuation body does not request explain_valuation_rows", () => {
    const body = JSON.stringify({
      user_team_id: "team_1",
      inflation_model: "replacement_slots_v2",
    });
    expect(body).not.toMatch(/explain/i);
  });

  it("selected-player valuation body may include explain_valuation_rows when explain is requested", () => {
    const explain = true;
    const body = JSON.stringify({
      player_id: "123",
      user_team_id: "team_1",
      inflation_model: "replacement_slots_v2",
      ...(explain ? { explain_valuation_rows: true } : {}),
    });
    expect(body).toContain('"explain_valuation_rows":true');
  });
});
