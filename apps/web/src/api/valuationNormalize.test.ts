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
});
