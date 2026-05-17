import { describe, expect, it } from "vitest";
import {
  PRODUCTION_AUCTION_CURVE_MODEL,
  resolveAuctionCurveModelForDraftRequest,
} from "./auctionCurveModel";

describe("resolveAuctionCurveModelForDraftRequest", () => {
  it("defaults to adaptive_surplus_v1 for production", () => {
    expect(resolveAuctionCurveModelForDraftRequest()).toBe(
      PRODUCTION_AUCTION_CURVE_MODEL,
    );
    expect(PRODUCTION_AUCTION_CURVE_MODEL).toBe("adaptive_surplus_v1");
  });

  it("honors explicit debug overrides", () => {
    expect(
      resolveAuctionCurveModelForDraftRequest({
        auction_curve_model: "linear_v1",
      }),
    ).toBe("linear_v1");
    expect(
      resolveAuctionCurveModelForDraftRequest({
        auction_curve_model: "tiered_surplus_v1",
      }),
    ).toBe("tiered_surplus_v1");
  });

  it("does not branch on checkpoint or demo league name", () => {
    expect(
      resolveAuctionCurveModelForDraftRequest({
        auction_curve_model: undefined,
      }),
    ).toBe("adaptive_surplus_v1");
  });
});
