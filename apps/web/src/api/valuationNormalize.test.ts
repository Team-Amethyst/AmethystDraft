import { describe, it, expect } from "vitest";
import {
  findRawValuationEntry,
  mergeValuationBoardRowIntoPrevious,
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
});
