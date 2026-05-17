import { describe, expect, it } from "vitest";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import { commandCenterBidDecision } from "../utils/valuation";
import { buildPlayerDetailValuationLadder } from "./playerDetailValuationLadder";

function basePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "woo",
    mlbId: 1,
    name: "Bryan Woo",
    team: "SEA",
    position: "SP",
    age: 25,
    catalog_rank: 50,
    value: 10,
    catalog_tier: 3,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...overrides,
  };
}

function boardRow(overrides: Partial<ValuationResult> = {}): ValuationResult {
  return {
    player_id: "woo",
    name: "Bryan Woo",
    position: "SP",
    tier: 3,
    baseline_value: 20,
    indicator: "Fair Value",
    ...overrides,
  };
}

describe("buildPlayerDetailValuationLadder", () => {
  it("bid edge equals team_value minus recommended_bid (ignores engine edge when different)", () => {
    const player = basePlayer({
      auction_value: 22,
      team_value: 47,
      recommended_bid: 34,
      max_bid: 34,
      edge: 25,
    });
    const ladder = buildPlayerDetailValuationLadder(player);
    expect(ladder.bidEdge).toBe(13);
    expect(ladder.bidEdge).toBe(
      Math.round((ladder.teamValue ?? 0) - (ladder.recommendedBid ?? 0)),
    );
  });

  it("reads max_bid separately from recommended_bid", () => {
    const ladder = buildPlayerDetailValuationLadder(
      basePlayer({
        auction_value: 22,
        team_value: 47,
        recommended_bid: 30,
        max_bid: 34,
      }),
    );
    expect(ladder.recommendedBid).toBe(30);
    expect(ladder.maxBid).toBe(34);
    expect(ladder.maxBidEqualsRecommended).toBe(false);
  });

  it("flags when max bid equals recommended bid", () => {
    const ladder = buildPlayerDetailValuationLadder(
      basePlayer({
        recommended_bid: 34,
        max_bid: 34,
      }),
    );
    expect(ladder.maxBidEqualsRecommended).toBe(true);
  });

  it("matches Command Center ladder dollars without wallet caps", () => {
    const player = basePlayer({
      auction_value: 22,
      team_value: 47,
      recommended_bid: 34,
      max_bid: 34,
    });
    const row = boardRow({
      auction_value: 22,
      team_value: 47,
      recommended_bid: 34,
      max_bid: 34,
    });
    const ladder = buildPlayerDetailValuationLadder(player, row);
    const cc = commandCenterBidDecision(row, player.value, null);

    expect(ladder.auctionValue).toBe(22);
    expect(ladder.recommendedBid).toBe(cc.suggestedBid);
    expect(ladder.teamValue).toBe(47);
    expect(ladder.bidEdge).toBe(13);
    expect(ladder.bidEdge).toBe(
      Math.round(47 - (cc.suggestedBid ?? 0)),
    );
  });
});
