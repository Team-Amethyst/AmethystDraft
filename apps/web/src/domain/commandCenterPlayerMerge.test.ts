import { describe, expect, it } from "vitest";
import { mergeFocusedExplainIntoBoardRow } from "../api/valuationNormalize";
import type { ValuationResult } from "../api/engine";

describe("Command Center focused explain merge", () => {
  const boardRow: ValuationResult = {
    player_id: "660271",
    name: "Ohtani",
    position: "DH",
    tier: 1,
    baseline_value: 35,
    auction_value: 36,
    indicator: "Fair Value",
  };

  it("keeps board auction_value when focused player response differs", () => {
    const playerRow: ValuationResult = {
      ...boardRow,
      auction_value: 40,
      valuation_explain: { replacement_key_used: "UTIL1" },
    };
    const merged = mergeFocusedExplainIntoBoardRow(boardRow, playerRow);
    expect(merged.auction_value).toBe(36);
    expect(merged.valuation_explain?.replacement_key_used).toBe("UTIL1");
  });
});
