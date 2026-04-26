import { describe, expect, it } from "vitest";
import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  commandCenterBidDecision,
  commandCenterConstrainedMoney,
  commandCenterMaxExecutableBid,
  commandCenterValuationMoney,
  commandCenterWalletCapsFromMyTeam,
  defaultValuationSortForPage,
  mergePlayerWithValuation,
  normalizeValuationPlayerId,
  resolveValuationNumber,
  valuationSortLabel,
  valuationTooltip,
} from "./valuation";
import type { League } from "../contexts/LeagueContext";

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

  it("commandCenterValuationMoney binds one engine field per line (no cross-field fallbacks)", () => {
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
    expect(m.market).toBe(30);

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
    expect(m2.your).toBeUndefined();
    expect(m2.likely).toBeUndefined();
    expect(m2.market).toBeUndefined();

    expect(commandCenterValuationMoney(undefined, 12).your).toBeUndefined();
  });

  it("commandCenterMaxExecutableBid is min(max_bid, budget − (spots−1))", () => {
    const caps = { maxBid: 18, budgetRemaining: 40, openSpots: 3 };
    expect(commandCenterMaxExecutableBid(caps)).toBe(18);
    const loose = { maxBid: 200, budgetRemaining: 40, openSpots: 3 };
    expect(commandCenterMaxExecutableBid(loose)).toBe(38);
  });

  it("commandCenterConstrainedMoney applies caps and likelyActionable", () => {
    const row = {
      player_id: "1",
      name: "A",
      position: "OF",
      tier: 1,
      baseline_value: 5,
      adjusted_value: 20,
      recommended_bid: 35,
      team_adjusted_value: 40,
      indicator: "Fair Value" as const,
    };
    const caps = { maxBid: 18, budgetRemaining: 40, openSpots: 3 };
    const d = commandCenterConstrainedMoney(row, 5, caps);
    expect(d.youCanPay).toBe(18);
    expect(d.yourIntrinsic).toBe(40);
    expect(d.likelyActionable).toBe(18);
    expect(d.budgetLimited).toBe(true);
    expect(d.market).toBe(35);
  });

  it("commandCenterBidDecision caps suggested bid and flags budget-limited", () => {
    const caps = { maxBid: 18, budgetRemaining: 40, openSpots: 3 };
    const row = {
      player_id: "1",
      name: "A",
      position: "OF",
      tier: 3,
      baseline_value: 5,
      adjusted_value: 20,
      recommended_bid: 35,
      team_adjusted_value: 40,
      edge: 5,
      indicator: "Fair Value" as const,
    };
    const dec = commandCenterBidDecision(row, 5, caps);
    expect(dec.maxExecutableBid).toBe(18);
    expect(dec.suggestedBid).toBe(18);
    expect(dec.budgetLimited).toBe(true);
    expect(dec.aggressive).toBe(true);
    expect(dec.edge).toBe(5);

    const rowCon = { ...row, tier: 5, team_adjusted_value: 16, edge: undefined };
    const dec2 = commandCenterBidDecision(rowCon, 5, caps);
    expect(dec2.aggressive).toBe(false);
    expect(dec2.suggestedBid).toBe(18);
    expect(dec2.baseUncapped).toBe(35);
  });

  it("commandCenterBidDecision uses engine edge when present", () => {
    const caps = { maxBid: 50, budgetRemaining: 100, openSpots: 2 };
    const row = {
      player_id: "1",
      name: "A",
      position: "OF",
      tier: 5,
      baseline_value: 1,
      adjusted_value: 10,
      recommended_bid: 10,
      team_adjusted_value: 12,
      edge: 10,
      indicator: "Fair Value" as const,
    };
    const dec = commandCenterBidDecision(row, 5, caps);
    expect(dec.aggressive).toBe(true);
    expect(dec.edge).toBe(10);
  });

  it("commandCenterWalletCapsFromMyTeam mirrors roster math", () => {
    const league = {
      rosterSlots: { SP: 5 },
      budget: 260,
    } as Pick<League, "rosterSlots" | "budget">;
    const caps = commandCenterWalletCapsFromMyTeam(league, []);
    expect(caps).not.toBeNull();
    expect(caps!.openSpots).toBe(5);
    expect(caps!.budgetRemaining).toBe(260);
    expect(caps!.maxBid).toBe(256);
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
