import { describe, expect, it } from "vitest";
import {
  formatResearchAuctionValueDisplay,
  NO_VALUATION_LABEL,
  researchAuctionValueCellTitle,
} from "./playerValuationCopy";

describe("playerValuationCopy", () => {
  it("shows No valuation for ineligible players without dollars", () => {
    expect(
      formatResearchAuctionValueDisplay(undefined, false),
    ).toBe(NO_VALUATION_LABEL);
  });

  it("uses standardized tooltip for ineligible players", () => {
    const title = researchAuctionValueCellTitle({
      maskEngineColumns: false,
      valuationEligible: false,
      showOutsideEnginePoolMinBidTooltip: false,
      outsideEnginePoolTooltip: "outside",
      auctionValueTooltip: "auction",
    });
    expect(title).toContain(NO_VALUATION_LABEL);
    expect(title).toContain("Insufficient projection");
  });
});
