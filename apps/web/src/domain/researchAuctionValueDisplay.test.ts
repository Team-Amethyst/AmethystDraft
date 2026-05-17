import { describe, expect, it } from "vitest";
import type { Player } from "../types/player";
import {
  buildResearchAuctionShelfAuditRows,
  buildResearchAuctionValueTooltip,
  formatAuctionValueRaw,
  researchAuctionRankSubtext,
  researchAuctionValueCellTitle,
  showAuctionRankInResearchValueCell,
  summarizeAuctionValueShelfSpread,
} from "./researchAuctionValueDisplay";

describe("researchAuctionValueDisplay", () => {
  it("formats raw auction values with cents when needed", () => {
    expect(formatAuctionValueRaw(15.72)).toBe("$15.72");
    expect(formatAuctionValueRaw(16)).toBe("$16");
    expect(formatAuctionValueRaw(-3.5)).toBe("-$3.50");
  });

  it("builds tooltip with raw value and rank", () => {
    const tip = buildResearchAuctionValueTooltip({
      baseTooltip: "Fair market value.",
      rawAuctionValue: 15.72,
      auctionRank: 8,
      roundedDisplay: "$16",
    });
    expect(tip).toContain("Fair market value.");
    expect(tip).toContain("Raw auction value: $15.72");
    expect(tip).toContain("Displayed (rounded): $16");
    expect(tip).toContain("Auction rank #8");
  });

  it("shows rank subtext when auction rank column hidden or sorting by value", () => {
    expect(
      showAuctionRankInResearchValueCell({
        isResearchLayout: true,
        sortCol: "name",
        showAuctionRankColumn: false,
      }),
    ).toBe(true);
    expect(
      showAuctionRankInResearchValueCell({
        isResearchLayout: true,
        sortCol: "value",
        showAuctionRankColumn: true,
      }),
    ).toBe(true);
    expect(
      showAuctionRankInResearchValueCell({
        isResearchLayout: true,
        sortCol: "auction_rank",
        showAuctionRankColumn: true,
      }),
    ).toBe(false);
  });

  it("formats rank subtext", () => {
    expect(researchAuctionRankSubtext(14)).toBe("#14");
    expect(researchAuctionRankSubtext(undefined)).toBeNull();
  });

  it("researchAuctionValueCellTitle defers to ineligible copy", () => {
    expect(
      researchAuctionValueCellTitle({
        maskEngineColumns: false,
        valuationEligible: false,
        showOutsideEnginePoolMinBidTooltip: false,
        outsideEnginePoolTooltip: "",
        auctionValueTooltip: "base",
      }),
    ).toContain("No valuation");
  });

  it("audit rows detect shelf spread mostly from rounding", () => {
    const players: Player[] = [
      { id: "a", name: "A", team: "NYY", position: "SS", auction_value: 16.41, auction_rank: 1 } as Player,
      { id: "b", name: "B", team: "NYY", position: "SS", auction_value: 16.49, auction_rank: 2 } as Player,
      { id: "c", name: "C", team: "NYY", position: "SS", auction_value: 15.25, auction_rank: 3 } as Player,
    ];
    const rows = buildResearchAuctionShelfAuditRows(players, 3);
    expect(rows[0]?.displayedWhole).toBe("$16");
    expect(rows[1]?.displayedWhole).toBe("$16");
    expect(rows[2]?.displayedWhole).toBe("$15");
    const summary = summarizeAuctionValueShelfSpread(rows);
    expect(summary.uniqueRawCount).toBe(3);
    expect(summary.uniqueDisplayedCount).toBe(2);
    expect(summary.mostlyRounding).toBe(true);
  });
});
