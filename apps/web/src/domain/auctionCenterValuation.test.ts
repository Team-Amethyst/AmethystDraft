import { describe, expect, it } from "vitest";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  auctionValueForCommandCenterPrefill,
  bidReasonDisclosureHasEngineContent,
  commandCenterEdgeVsMaxBidRounded,
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
      adjusted_value: 30,
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
      adjusted_value: 30,
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
      adjusted_value: 30,
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
