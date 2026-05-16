import { describe, expect, it } from "vitest";
import { commandCenterActionVerdict } from "./commandCenterActionVerdict";

describe("commandCenterActionVerdict", () => {
  it("returns Avoid when not bidable", () => {
    expect(
      commandCenterActionVerdict({
        notBidable: true,
        notBidableReason: "No open roster slots",
        leagueFmv: 38,
        suggestedBid: 0,
        teamValue: 50,
        bidEdge: undefined,
      }).label,
    ).toBe("Avoid");
  });

  it("returns Reach when suggested bid is well above league FMV", () => {
    const v = commandCenterActionVerdict({
      notBidable: false,
      notBidableReason: null,
      leagueFmv: 38,
      suggestedBid: 55,
      teamValue: 60,
      bidEdge: 5,
    });
    expect(v.kind).toBe("reach");
    expect(v.label).toBe("Reach");
  });

  it("returns Good value when bid edge is strong", () => {
    expect(
      commandCenterActionVerdict({
        notBidable: false,
        notBidableReason: null,
        leagueFmv: 38,
        suggestedBid: 40,
        teamValue: 52,
        bidEdge: 12,
      }).label,
    ).toBe("Good value");
  });
});
