import { describe, expect, it } from "vitest";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  commandCenterValuationMoney,
  defaultValuationSortForPage,
  mergePlayerWithValuation,
  normalizeValuationPlayerId,
  resolveValuationNumber,
  valuationSortLabel,
  valuationTooltip,
} from "./valuation";

function basePlayer(): Player {
  return {
    id: "1",
    mlbId: 1,
    name: "A",
    team: "NYY",
    position: "OF",
    positions: ["OF"],
    age: 28,
    adp: 20,
    value: 24,
    tier: 3,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  };
}

describe("valuation helpers", () => {
  it("merges all new valuation fields from engine row", () => {
    const merged = mergePlayerWithValuation(basePlayer(), {
      player_id: "1",
      baseline_value: 20,
      adjusted_value: 26,
      recommended_bid: 29,
      team_adjusted_value: 31,
      inflation_model: "replacement_slots_v2",
      indicator: "Steal",
    });
    expect(merged.baseline_value).toBe(20);
    expect(merged.adjusted_value).toBe(26);
    expect(merged.recommended_bid).toBe(29);
    expect(merged.team_adjusted_value).toBe(31);
    expect(merged.inflation_model).toBe("replacement_slots_v2");
    expect(merged.indicator).toBe("Steal");
  });

  it("uses strict fallback order for valuation numbers", () => {
    const player = basePlayer();
    expect(resolveValuationNumber(player)).toBe(24);

    player.baseline_value = 21;
    expect(resolveValuationNumber(player)).toBe(21);

    player.adjusted_value = 25;
    expect(resolveValuationNumber(player)).toBe(25);

    player.recommended_bid = 27;
    expect(resolveValuationNumber(player)).toBe(27);

    player.team_adjusted_value = 30;
    expect(resolveValuationNumber(player)).toBe(30);
  });

  it("returns page default valuation fields", () => {
    expect(defaultValuationSortForPage("Research")).toBe("recommended_bid");
    expect(defaultValuationSortForPage("MyDraft")).toBe("team_adjusted_value");
    expect(defaultValuationSortForPage("AuctionCenter")).toBe(
      "team_adjusted_value",
    );
    expect(defaultValuationSortForPage("CommandCenter")).toBe("adjusted_value");
  });

  it("normalizes valuation player ids for map keys", () => {
    expect(normalizeValuationPlayerId("  123  ")).toBe("123");
    expect(normalizeValuationPlayerId(456)).toBe("456");
  });

  it("commandCenterValuationMoney uses per-column fallback chains", () => {
    const row = {
      player_id: "1",
      name: "A",
      position: "OF",
      tier: 1,
      baseline_value: 10,
      adjusted_value: 20,
      recommended_bid: 30,
      team_adjusted_value: 40,
      indicator: "Fair Value" as const,
    };
    const m = commandCenterValuationMoney(row, 5);
    expect(m.your).toBe(40);
    expect(m.likely).toBe(30);
    expect(m.market).toBe(20);

    const partial = {
      player_id: "1",
      name: "A",
      position: "OF",
      tier: 1,
      baseline_value: 10,
      adjusted_value: 20,
      indicator: "Fair Value" as const,
    } as ValuationResult;
    const m2 = commandCenterValuationMoney(partial, 99);
    expect(m2.your).toBe(20);
    expect(m2.likely).toBe(20);
    expect(m2.market).toBe(20);

    expect(commandCenterValuationMoney(undefined, 12).your).toBe(12);
  });

  it("exposes compact labels and tooltip copy", () => {
    expect(valuationSortLabel("team_adjusted_value")).toBe("Your Value");
    expect(valuationSortLabel("recommended_bid")).toBe("Likely Bid");
    expect(valuationSortLabel("adjusted_value")).toBe("Market Value");
    expect(valuationSortLabel("baseline_value")).toBe("Player Strength");
    expect(valuationTooltip("team_adjusted_value")).toContain("Personalized");
    expect(valuationTooltip("recommended_bid")).toContain("auction guidance");
    expect(valuationTooltip("adjusted_value")).toContain("remaining roster slots");
    expect(valuationTooltip("baseline_value")).toContain("before auction context");
  });
});
