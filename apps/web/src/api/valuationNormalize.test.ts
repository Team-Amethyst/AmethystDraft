import { describe, it, expect } from "vitest";
import {
  findRawValuationEntry,
  mergeValuationBoardRowIntoPrevious,
  normalizeValuationResponseBody,
  normalizeValuationResultRow,
} from "./valuationNormalize";
import type { ValuationResult } from "./engine";

function baseRow(
  overrides: Partial<ValuationResult> & Record<string, unknown> = {},
): ValuationResult {
  return {
    player_id: "660271",
    name: "Test",
    position: "OF",
    tier: 3,
    baseline_value: 20,
    adjusted_value: 22,
    indicator: "Fair Value",
    ...overrides,
  };
}

describe("valuationNormalize", () => {
  it("coerces numeric strings for optional fields", () => {
    const row = normalizeValuationResultRow({
      player_id: "1",
      name: "S",
      position: "P",
      tier: "2",
      baselineValue: "10",
      adjustedValue: "11",
      recommendedBid: "13",
      teamAdjustedValue: "14",
      edge: "0.5",
      indicator: "Fair Value",
    });
    expect(row.tier).toBe(2);
    expect(row.baseline_value).toBe(10);
    expect(row.adjusted_value).toBe(11);
    expect(row.recommended_bid).toBe(13);
    expect(row.team_adjusted_value).toBe(14);
    expect(row.edge).toBe(0.5);
  });

  it("maps camelCase optional fields onto ValuationResult", () => {
    const row = normalizeValuationResultRow({
      playerId: "660271",
      name: "X",
      position: "OF",
      tier: 2,
      baselineValue: 10,
      adjustedValue: 12,
      recommendedBid: 14,
      teamAdjustedValue: 15,
      edge: 1.5,
      indicator: "Steal",
    });
    expect(row.player_id).toBe("660271");
    expect(row.baseline_value).toBe(10);
    expect(row.adjusted_value).toBe(12);
    expect(row.recommended_bid).toBe(14);
    expect(row.team_adjusted_value).toBe(15);
    expect(row.edge).toBe(1.5);
    expect(row.indicator).toBe("Steal");
  });

  it("findRawValuationEntry matches snake or camel player_id", () => {
    const raw = {
      valuations: [{ playerId: "99", recommendedBid: 5 }],
    };
    expect(findRawValuationEntry(raw, "99")).toEqual(raw.valuations[0]);
  });

  it("mergeValuationBoardRowIntoPrevious keeps prior optional fields when board omits them", () => {
    const prev = baseRow({
      recommended_bid: 9,
      team_adjusted_value: 11,
      edge: 2,
    });
    const board = baseRow({
      recommended_bid: undefined,
      team_adjusted_value: undefined,
      edge: undefined,
      baseline_value: 25,
      adjusted_value: 26,
    });
    const merged = mergeValuationBoardRowIntoPrevious(prev, board);
    expect(merged.recommended_bid).toBe(9);
    expect(merged.team_adjusted_value).toBe(11);
    expect(merged.edge).toBe(2);
    expect(merged.baseline_value).toBe(25);
    expect(merged.adjusted_value).toBe(26);
  });

  it("merge prefers board optional fields when both are finite", () => {
    const prev = baseRow({ recommended_bid: 5, team_adjusted_value: 6 });
    const board = baseRow({ recommended_bid: 30, team_adjusted_value: 31 });
    const merged = mergeValuationBoardRowIntoPrevious(prev, board);
    expect(merged.recommended_bid).toBe(30);
    expect(merged.team_adjusted_value).toBe(31);
  });

  it("maps auction_value snake and camel", () => {
    const snake = normalizeValuationResultRow({
      player_id: "1",
      name: "S",
      position: "P",
      tier: 1,
      baseline_value: 1,
      auction_value: 40,
      adjusted_value: 41,
      indicator: "Fair Value",
    });
    expect(snake.auction_value).toBe(40);
    expect(snake.adjusted_value).toBe(41);

    const camel = normalizeValuationResultRow({
      playerId: "2",
      name: "T",
      position: "C",
      tier: 1,
      baselineValue: 2,
      auctionValue: 50,
      adjustedValue: 51,
      indicator: "Fair Value",
    });
    expect(camel.auction_value).toBe(50);
    expect(camel.adjusted_value).toBe(51);
  });

  it("merge keeps prior auction_value when board row omits it", () => {
    const prev = baseRow({ auction_value: 40, adjusted_value: 41 });
    const board = baseRow({ adjusted_value: 42 });
    const merged = mergeValuationBoardRowIntoPrevious(prev, board);
    expect(merged.auction_value).toBe(40);
    expect(merged.adjusted_value).toBe(42);
  });

  it("normalizeValuationResponseBody copies user_team_id_used", () => {
    const out = normalizeValuationResponseBody({
      valuations: [],
      inflation_factor: 1,
      user_team_id_used: "team_3",
    });
    expect(out.user_team_id_used).toBe("team_3");
  });

  it("normalizeValuationResponseBody accepts camelCase userTeamIdUsed", () => {
    const out = normalizeValuationResponseBody({
      valuations: [],
      inflation_factor: 1,
      userTeamIdUsed: "team_7",
    });
    expect(out.user_team_id_used).toBe("team_7");
  });

  it("normalizeValuationResponseBody maps valuation_context_warnings snake and camel", () => {
    const snake = normalizeValuationResponseBody({
      valuations: [],
      inflation_factor: 1,
      valuation_context_warnings: ["thin bench", "  "],
    });
    expect(snake.valuation_context_warnings).toEqual(["thin bench"]);

    const camel = normalizeValuationResponseBody({
      valuations: [],
      inflation_factor: 1,
      valuationContextWarnings: ["x"],
    });
    expect(camel.valuation_context_warnings).toEqual(["x"]);
  });

  it("normalizeValuationResponseBody maps valuation_context object", () => {
    const out = normalizeValuationResponseBody({
      valuations: [],
      inflation_factor: 1,
      valuation_context: { pool_phase: "mid", k: 1 },
    });
    expect(out.valuation_context).toEqual({ pool_phase: "mid", k: 1 });
  });

  it("normalizeValuationResultRow maps valuation_explain and notes", () => {
    const row = normalizeValuationResultRow({
      player_id: "1",
      name: "S",
      position: "P",
      tier: 1,
      baseline_value: 1,
      adjusted_value: 10,
      indicator: "Fair Value",
      recommended_bid_note: "anchor high",
      edge_note: "vs bid",
      valuation_explain: {
        effective_positions: ["SS", "2B"],
        replacementKeyUsed: "MI3",
        replacementValueUsed: 4,
        surplus_basis: "ta_minus_rb",
        inflationFactor: 1.05,
        poolToSlotRatio: 2.5,
        scoringCategoryWarnings: ["SV thin"],
        ageYears: 27,
        ageMultiplier: 0.94,
        depthChartPositionResolved: "LF4",
        depthMultiplier: 0.88,
        ageDepthCombinedMultiplier: 0.83,
        injurySeverity: "moderate",
        injuryMultiplier: 0.95,
        ageComponent: -2,
        depthComponent: 0.91,
      },
    });
    expect(row.recommended_bid_note).toBe("anchor high");
    expect(row.edge_note).toBe("vs bid");
    expect(row.valuation_explain?.effective_positions).toEqual(["SS", "2B"]);
    expect(row.valuation_explain?.replacement_key_used).toBe("MI3");
    expect(row.valuation_explain?.replacement_value_used).toBe(4);
    expect(row.valuation_explain?.surplus_basis).toBe("ta_minus_rb");
    expect(row.valuation_explain?.inflation_factor).toBe(1.05);
    expect(row.valuation_explain?.pool_to_slot_ratio).toBe(2.5);
    expect(row.valuation_explain?.scoring_category_warnings).toEqual(["SV thin"]);
    expect(row.valuation_explain?.age_years).toBe(27);
    expect(row.valuation_explain?.age_multiplier).toBe(0.94);
    expect(row.valuation_explain?.depth_chart_position_resolved).toBe("LF4");
    expect(row.valuation_explain?.depth_multiplier).toBe(0.88);
    expect(row.valuation_explain?.age_depth_combined_multiplier).toBe(0.83);
    expect(row.valuation_explain?.injury_severity).toBe("moderate");
    expect(row.valuation_explain?.injury_multiplier).toBe(0.95);
    expect(row.valuation_explain?.age_component).toBe(-2);
    expect(row.valuation_explain?.depth_component).toBe(0.91);
  });

  it("mergeValuationBoardRowIntoPrevious keeps explain when board omits it", () => {
    const prev = baseRow({
      valuation_explain: { surplus_basis: "x" },
      recommended_bid_note: "keep me",
    });
    const board = baseRow({ adjusted_value: 12 });
    const merged = mergeValuationBoardRowIntoPrevious(prev, board);
    expect(merged.valuation_explain).toEqual({ surplus_basis: "x" });
    expect(merged.recommended_bid_note).toBe("keep me");
  });
});
