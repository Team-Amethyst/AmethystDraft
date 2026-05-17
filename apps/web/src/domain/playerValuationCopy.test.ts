import { describe, expect, it } from "vitest";
import {
  formatResearchAuctionValueDisplay,
  NO_VALUATION_LABEL,
  researchAuctionValueCellTitle,
} from "./playerValuationCopy";

describe("playerValuationCopy", () => {
  it("leaves auction value blank when dollars are missing", () => {
    expect(
      formatResearchAuctionValueDisplay(undefined),
    ).toBe("");
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
