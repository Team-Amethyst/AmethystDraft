import { describe, expect, it } from "vitest";
import type { ValuationExplain, ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  commandCenterBidDecision,
  commandCenterConstrainedMoney,
  commandCenterMaxExecutableBid,
  commandCenterValuationMoney,
  commandCenterWalletCapsFromMyTeam,
  defaultValuationSortForPage,
  formatCurrencyWhole,
  formatExplainRiskMultiplier,
  formatInflationFactorMultiple,
  formatMaybeDelta,
  formatPoolToSlotRatio,
  formatValuationExplainAgeDepthComponent,
  isMeaningfulExplainMultiplier,
  leagueWideAuctionDollars,
  mergePlayerWithFocusedExplainEnrichment,
  mergePlayerWithValuation,
  normalizeValuationPlayerId,
  BID_EDGE_TOOLTIP,
  REPLACEMENT_COMPARISON_SLOT_TOOLTIP,
  playerBidEdgeDollars,
  playerRosterEdgeDollars,
  playerValuationEdgeOrDiff,
  RECOMMENDED_BID_VS_AUCTION_VALUE_COPY,
  RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP,
  ROSTER_EDGE_TOOLTIP,
  RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY,
  resolveValuationNumber,
  valuationExplainHasRiskRoleContent,
  valuationSortLabel,
  valuationTooltip,
} from "./valuation";
import {
  actionableBidFromRecommendedAndMaxBid,
  verdictFromValueMinusBid,
} from "../domain/auctionCenterValuation";
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
    catalog_rank: 20,
    value: 24,
    catalog_tier: 3,
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
      auction_tier: 2,
      baseline_value: 20,
      auction_value: 28,
      adjusted_value: 26,
      recommended_bid: 29,
      team_adjusted_value: 31,
      inflation_model: "replacement_slots_v2",
      indicator: "Steal",
    });
    expect(merged.auction_tier).toBe(2);
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

  describe("mergePlayerWithFocusedExplainEnrichment (Research modal)", () => {
    const boardRow = {
      player_id: "1",
      auction_value: 30,
      adjusted_value: 28,
      recommended_bid: 32,
      team_adjusted_value: 34,
      baseline_value: 22,
      edge: 2,
    };

    it("keeps board auction_value when focused sends a different finite auction_value", () => {
      const afterBoard = mergePlayerWithValuation(basePlayer(), boardRow);
      const merged = mergePlayerWithFocusedExplainEnrichment(
        afterBoard,
        boardRow,
        {
          player_id: "1",
          auction_value: 31,
        },
      );
      expect(merged.auction_value).toBe(30);
    });

    it("keeps board recommended_bid when focused sends a different bid anchor", () => {
      const afterBoard = mergePlayerWithValuation(basePlayer(), boardRow);
      const merged = mergePlayerWithFocusedExplainEnrichment(
        afterBoard,
        boardRow,
        {
          player_id: "1",
          recommended_bid: 40,
        },
      );
      expect(merged.recommended_bid).toBe(32);
    });

    it("adds valuation_explain from focused without changing preserved dollars", () => {
      const afterBoard = mergePlayerWithValuation(basePlayer(), boardRow);
      const explain: ValuationExplain = {
        replacement_key_used: "SS3",
        replacement_value_used: 4,
      };
      const merged = mergePlayerWithFocusedExplainEnrichment(
        afterBoard,
        boardRow,
        {
          player_id: "1",
          auction_value: 99,
          recommended_bid: 99,
          valuation_explain: explain,
        },
      );
      expect(merged.auction_value).toBe(30);
      expect(merged.recommended_bid).toBe(32);
      expect(merged.valuation_explain?.replacement_key_used).toBe("SS3");
    });

    it("fills a core dollar from focused when the board row omits that field", () => {
      const partialBoard = {
        player_id: "1",
        adjusted_value: 26,
        recommended_bid: 10,
        team_adjusted_value: 20,
        baseline_value: 15,
        edge: 10,
      };
      const afterBoard = mergePlayerWithValuation(basePlayer(), partialBoard);
      const merged = mergePlayerWithFocusedExplainEnrichment(
        afterBoard,
        partialBoard,
        {
          player_id: "1",
          auction_value: 44,
        },
      );
      expect(merged.auction_value).toBe(44);
      expect(merged.adjusted_value).toBe(26);
    });
  });

  describe("Roster Edge and Bid Edge helpers", () => {
    it("Roster Edge tooltip is Team Value minus Auction Value", () => {
      expect(ROSTER_EDGE_TOOLTIP).toBe(
        "Roster Edge = Team Value minus Auction Value.",
      );
    });

    it("Replacement comparison slot tooltip distinguishes surplus slot from role", () => {
      expect(REPLACEMENT_COMPARISON_SLOT_TOOLTIP).toContain(
        "replacement value is used to calculate",
      );
      expect(REPLACEMENT_COMPARISON_SLOT_TOOLTIP).toContain(
        "not necessarily the player's real-life role",
      );
    });

    it("Bid Edge tooltip explains Team − Max and elite caveat", () => {
      expect(BID_EDGE_TOOLTIP).toContain("Team Value minus Max Bid");
      expect(BID_EDGE_TOOLTIP).toContain(
        "Negative values mean Team Value is below Max Bid",
      );
      expect(BID_EDGE_TOOLTIP).toContain(
        "For elite players, this can be normal because Max Bid is an aggressive bid anchor",
      );
      expect(RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP).toBe(BID_EDGE_TOOLTIP);
    });

    it("Research footer directs users to Player Detail for non-table metrics", () => {
      expect(RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY).toContain(
        "Open a player",
      );
      expect(RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY).toContain(
        "Roster Edge",
      );
      expect(RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY).toContain("Bid Edge");
      expect(RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY).toContain(
        "Baseline Strength",
      );
      expect(RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY).toContain(
        "Team Value",
      );
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

    it("playerBidEdgeDollars matches playerValuationEdgeOrDiff", () => {
      const p = { recommended_bid: 30, team_adjusted_value: 44 };
      expect(playerBidEdgeDollars(p)).toBe(playerValuationEdgeOrDiff(p));
    });

    it("playerRosterEdgeDollars is Team Value minus Auction Value", () => {
      expect(
        playerRosterEdgeDollars({
          team_adjusted_value: 40,
          auction_value: 35,
          adjusted_value: 99,
        }),
      ).toBe(5);
      expect(
        playerRosterEdgeDollars({
          team_adjusted_value: 40,
          adjusted_value: 45,
        }),
      ).toBe(-5);
      expect(playerRosterEdgeDollars({})).toBeUndefined();
    });
  });

  it("verdictFromValueMinusBid softens negative delta for star bid-relative mode", () => {
    const v = verdictFromValueMinusBid(-20, { bidRelativeStar: true });
    expect(v.danger).toBe(false);
    expect(v.label).toBe("Bid-relative");
    expect(v.cardTone).toBe("fair");
  });

  it("formats valuation_explain inflation_factor as multiplier not dollars", () => {
    expect(formatInflationFactorMultiple(0.923)).toBe("0.92×");
    expect(formatInflationFactorMultiple(0.9)).toBe("0.9×");
    expect(formatInflationFactorMultiple(1)).toBe("1×");
  });

  it("formats valuation_explain pool_to_slot_ratio as plain number", () => {
    expect(formatPoolToSlotRatio(2.3)).toBe("2.3");
    expect(formatPoolToSlotRatio(2)).toBe("2");
    expect(formatPoolToSlotRatio(2.345)).toBe("2.35");
  });

  it("isMeaningfulExplainMultiplier hides neutral 1", () => {
    expect(isMeaningfulExplainMultiplier(1)).toBe(false);
    expect(isMeaningfulExplainMultiplier(1.0000001)).toBe(false);
    expect(isMeaningfulExplainMultiplier(0.92)).toBe(true);
    expect(isMeaningfulExplainMultiplier(1.04)).toBe(true);
  });

  it("formatExplainRiskMultiplier matches inflation multiple style", () => {
    expect(formatExplainRiskMultiplier(0.89)).toBe("0.89×");
    expect(formatExplainRiskMultiplier(1)).toBe("1×");
  });

  it("formatValuationExplainAgeDepthComponent uses × for (0,1) and dollars otherwise", () => {
    expect(formatValuationExplainAgeDepthComponent(0.91)).toBe("0.91×");
    expect(formatValuationExplainAgeDepthComponent(-3)).toBe("$-3");
    expect(formatValuationExplainAgeDepthComponent(12)).toBe("$12");
    expect(formatValuationExplainAgeDepthComponent(0)).toBeUndefined();
    expect(formatValuationExplainAgeDepthComponent(undefined)).toBeUndefined();
  });

  it("valuationExplainHasRiskRoleContent is false when no risk fields", () => {
    expect(valuationExplainHasRiskRoleContent({})).toBe(false);
    expect(valuationExplainHasRiskRoleContent({ age_multiplier: 1 })).toBe(false);
    expect(
      valuationExplainHasRiskRoleContent({
        age_years: 29,
        age_multiplier: 0.9,
        injury_severity: "low",
      }),
    ).toBe(true);
    expect(
      valuationExplainHasRiskRoleContent({ injury_severity: 0 } satisfies ValuationExplain),
    ).toBe(true);
  });

  it("preserves catalog tier when valuation omits auction tier", () => {
    const merged = mergePlayerWithValuation(basePlayer(), {
      player_id: "1",
      baseline_value: 20,
    });
    expect(merged.catalog_tier).toBe(3);
    expect(merged.auction_tier).toBeUndefined();
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
    expect(valuationSortLabel("team_adjusted_value")).toBe("Team Value");
    expect(valuationSortLabel("recommended_bid")).toBe("Max Bid");
    expect(valuationSortLabel("adjusted_value")).toBe("League context $");
    expect(valuationSortLabel("baseline_value")).toBe("Baseline Strength");
    expect(valuationTooltip("auction_value")).toContain("league-wide");
    expect(valuationTooltip("auction_value")).toContain("not your bid cap");
    expect(valuationTooltip("team_adjusted_value")).toContain("Team Value");
    expect(valuationTooltip("recommended_bid")).toContain("Strategic bid");
    expect(valuationTooltip("recommended_bid")).toContain("recommended_bid");
    expect(valuationTooltip("recommended_bid")).toContain(
      RECOMMENDED_BID_VS_AUCTION_VALUE_COPY,
    );
    expect(valuationTooltip("adjusted_value")).toContain("adjusted_value");
    expect(valuationTooltip("baseline_value")).toContain("Baseline Strength");
    expect(valuationTooltip("baseline_value")).toContain(
      "pre-auction model strength",
    );
  });

  it("Command Center / Player Detail ladder: Max Bid label, Bid Edge delta, and tooltips", () => {
    expect(valuationSortLabel("recommended_bid")).toBe("Max Bid");
    expect(BID_EDGE_TOOLTIP).toContain("Team Value minus Max Bid");
    expect(formatMaybeDelta(playerValuationEdgeOrDiff({ team_adjusted_value: 23, recommended_bid: 44 }))).toBe(
      "-21",
    );
  });

  it("actionable log bid default uses recommended_bid (capped), not auction_value", () => {
    const row = {
      player_id: "x",
      recommended_bid: 44,
      auction_value: 19,
      team_adjusted_value: 23,
    } as ValuationResult;
    expect(actionableBidFromRecommendedAndMaxBid(row, 100)).toBe(44);
    expect(actionableBidFromRecommendedAndMaxBid(row, 30)).toBe(30);
    expect(actionableBidFromRecommendedAndMaxBid(row, null)).toBe(44);
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

    it("does not use recommended_bid or team_adjusted_value for the table primary $", () => {
      const row = {
        auction_value: 30,
        adjusted_value: 99,
        recommended_bid: 60,
        team_adjusted_value: 45,
      };
      expect(leagueWideAuctionDollars(row)).toBe(30);
      expect(formatCurrencyWhole(leagueWideAuctionDollars(row))).toBe("$30");
    });
  });
});
