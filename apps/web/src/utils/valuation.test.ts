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
  formatCurrencyWhole,
  leagueWideAuctionDollars,
  mergePlayerWithValuation,
  normalizeValuationPlayerId,
  playerValuationEdgeOrDiff,
  RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP,
  RESEARCH_TABLE_FOOTER_MAX_ANCHOR_COPY,
  researchTableSecondaryMaxTeamLine,
  resolveValuationNumber,
  valuationSortLabel,
  valuationTooltip,
} from "./valuation";
import { verdictFromValueMinusBid } from "../domain/auctionCenterValuation";
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
      tier: 2,
      baseline_value: 20,
      auction_value: 28,
      adjusted_value: 26,
      recommended_bid: 29,
      team_adjusted_value: 31,
      inflation_model: "replacement_slots_v2",
      indicator: "Steal",
    });
    expect(merged.tier).toBe(2);
    expect(merged.baseline_value).toBe(20);
    expect(merged.auction_value).toBe(28);
    expect(merged.adjusted_value).toBe(26);
    expect(merged.recommended_bid).toBe(29);
    expect(merged.team_adjusted_value).toBe(31);
    expect(merged.inflation_model).toBe("replacement_slots_v2");
    expect(merged.indicator).toBe("Steal");
  });

  it("merges explainability notes and valuation_explain from engine row", () => {
    const merged = mergePlayerWithValuation(basePlayer(), {
      player_id: "1",
      recommended_bid_note: "Strategic anchor",
      edge_note: "Bid-relative",
      valuation_explain: {
        effective_positions: ["OF"],
        replacement_key_used: "OF5",
        replacement_value_used: 3,
      },
    });
    expect(merged.recommended_bid_note).toBe("Strategic anchor");
    expect(merged.edge_note).toBe("Bid-relative");
    expect(merged.valuation_explain?.replacement_key_used).toBe("OF5");
  });

  describe("Edge vs Max (detail views + helpers)", () => {
    it("Edge vs Max tooltip explains Team − Max and elite caveat", () => {
      expect(RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP).toContain(
        "Team Value minus Max Bid",
      );
      expect(RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP).toContain(
        "Negative values mean Team Value is below Max Bid",
      );
      expect(RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP).toContain(
        "For elite players, this can be normal because Max Bid is an aggressive bid anchor",
      );
    });

    it("Research footer copy distinguishes Max from auction value", () => {
      expect(RESEARCH_TABLE_FOOTER_MAX_ANCHOR_COPY).toContain(
        "strategic bid anchor",
      );
      expect(RESEARCH_TABLE_FOOTER_MAX_ANCHOR_COPY).toContain("auction value");
    });

    it("playerValuationEdgeOrDiff prefers Engine edge when present", () => {
      expect(
        playerValuationEdgeOrDiff({
          edge: 12,
          recommended_bid: 50,
          team_adjusted_value: 10,
        }),
      ).toBe(12);
    });

    it("playerValuationEdgeOrDiff falls back to Team Value minus Max Bid", () => {
      expect(
        playerValuationEdgeOrDiff({
          recommended_bid: 30,
          team_adjusted_value: 40,
        }),
      ).toBe(10);
    });

    it("playerValuationEdgeOrDiff returns undefined when surplus cannot be derived", () => {
      expect(playerValuationEdgeOrDiff({})).toBeUndefined();
      expect(playerValuationEdgeOrDiff({ recommended_bid: 5 })).toBeUndefined();
      expect(playerValuationEdgeOrDiff({ team_adjusted_value: 5 })).toBeUndefined();
    });

    it("playerValuationEdgeOrDiff reads numeric strings for edge and Team − Max inputs", () => {
      expect(
        playerValuationEdgeOrDiff({ edge: "-4" } as unknown as Player),
      ).toBe(-4);
      expect(
        playerValuationEdgeOrDiff({
          recommended_bid: "30",
          team_adjusted_value: "26",
        } as unknown as Player),
      ).toBe(-4);
    });
  });

  it("verdictFromValueMinusBid softens negative delta for star bid-relative mode", () => {
    const v = verdictFromValueMinusBid(-20, { bidRelativeStar: true });
    expect(v.danger).toBe(false);
    expect(v.label).toBe("Bid-relative");
    expect(v.cardTone).toBe("fair");
  });

  it("preserves player tier when valuation tier is missing", () => {
    const merged = mergePlayerWithValuation(basePlayer(), {
      player_id: "1",
      baseline_value: 20,
    });
    expect(merged.tier).toBe(3);
  });

  it("uses strict fallback order for valuation numbers (league auction before roster fields)", () => {
    const player = basePlayer();
    expect(resolveValuationNumber(player)).toBe(24);

    player.baseline_value = 21;
    expect(resolveValuationNumber(player)).toBe(21);

    player.adjusted_value = 25;
    expect(resolveValuationNumber(player)).toBe(25);

    player.recommended_bid = 27;
    expect(resolveValuationNumber(player)).toBe(25);

    player.team_adjusted_value = 30;
    expect(resolveValuationNumber(player)).toBe(25);

    player.auction_value = 33;
    expect(resolveValuationNumber(player)).toBe(33);
  });

  it("returns page default valuation fields", () => {
    expect(defaultValuationSortForPage("Research")).toBe("auction_value");
    expect(defaultValuationSortForPage("MyDraft")).toBe("auction_value");
    expect(defaultValuationSortForPage("AuctionCenter")).toBe("auction_value");
    expect(defaultValuationSortForPage("CommandCenter")).toBe("auction_value");
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
    const m = commandCenterValuationMoney(row);
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
    const m2 = commandCenterValuationMoney(partial);
    expect(m2.your).toBeUndefined();
    expect(m2.likely).toBeUndefined();
    expect(m2.market).toBe(20);

    expect(commandCenterValuationMoney(undefined).your).toBeUndefined();
  });

  it("commandCenterValuationMoney prefers auction_value for market line", () => {
    const row = {
      player_id: "1",
      name: "A",
      position: "OF",
      tier: 1,
      baseline_value: 5,
      auction_value: 55,
      adjusted_value: 20,
      recommended_bid: 30,
      team_adjusted_value: 40,
      indicator: "Fair Value" as const,
    };
    const m = commandCenterValuationMoney(row);
    expect(m.market).toBe(55);
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
    expect(d.market).toBe(20);
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
    expect(valuationSortLabel("auction_value")).toBe("Auction value");
    expect(valuationSortLabel("team_adjusted_value")).toBe("Value to Your Roster");
    expect(valuationSortLabel("recommended_bid")).toBe("Recommended Bid");
    expect(valuationSortLabel("adjusted_value")).toBe("League context $");
    expect(valuationSortLabel("baseline_value")).toBe("Player strength");
    expect(valuationTooltip("auction_value")).toContain("auction_value");
    expect(valuationTooltip("team_adjusted_value")).toContain("team_adjusted_value");
    expect(valuationTooltip("recommended_bid")).toContain("recommended_bid");
    expect(valuationTooltip("adjusted_value")).toContain("adjusted_value");
    expect(valuationTooltip("baseline_value")).toContain("baseline_value");
  });

  it("leagueWideAuctionDollars prefers auction_value over adjusted_value", () => {
    expect(
      leagueWideAuctionDollars({ auction_value: 12, adjusted_value: 99 }),
    ).toBe(12);
    expect(leagueWideAuctionDollars({ adjusted_value: 44 })).toBe(44);
    expect(leagueWideAuctionDollars({})).toBeUndefined();
  });

  describe("Research PlayerTable valuation cell (contract)", () => {
    it("uses auction_value as the primary dollar (not baseline_value)", () => {
      const row = {
        auction_value: 29,
        adjusted_value: 40,
        baseline_value: 99,
        recommended_bid: 51,
        team_adjusted_value: 29,
      };
      expect(leagueWideAuctionDollars(row)).toBe(29);
      expect(formatCurrencyWhole(leagueWideAuctionDollars(row))).toBe("$29");
      expect(formatCurrencyWhole(row.baseline_value)).toBe("$99");
    });

    it("secondary Max uses recommended_bid and Team uses team_adjusted_value", () => {
      expect(
        researchTableSecondaryMaxTeamLine({
          recommended_bid: 51,
          team_adjusted_value: 29,
        }),
      ).toBe("Max $51 · Team $29");
    });

    it("uses dashes when Max or Team inputs are missing", () => {
      expect(researchTableSecondaryMaxTeamLine({})).toBe("Max — · Team —");
    });

    it("labels Max from recommended_bid, not as the league-wide auction anchor", () => {
      const line = researchTableSecondaryMaxTeamLine({
        recommended_bid: 60,
        team_adjusted_value: 45,
      });
      expect(line).toMatch(/^Max \$60/);
      expect(line).toContain("Team $45");
      expect(line).not.toMatch(/Recommended/i);
    });
  });
});
