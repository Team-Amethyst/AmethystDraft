import { describe, expect, it } from "vitest";
import {
  formatDisplayTierBandDisplay,
  displayTierMaxWholeDollar,
} from "./displayTiers";
import type { TierStats } from "../utils/tiers";

function bandStat(
  partial: Partial<
    Pick<
      TierStats,
      | "minValueDisplay"
      | "maxValueDisplay"
      | "minCoreValueDisplay"
      | "shelvedCount"
      | "valuedPlayerCount"
    >
  >,
): Pick<
  TierStats,
  | "minValueDisplay"
  | "maxValueDisplay"
  | "minCoreValueDisplay"
  | "shelvedCount"
  | "valuedPlayerCount"
> {
  return {
    minValueDisplay: 1,
    maxValueDisplay: 1,
    minCoreValueDisplay: 1,
    shelvedCount: 0,
    valuedPlayerCount: 1,
    ...partial,
  };
}

describe("formatDisplayTierBandDisplay", () => {
  it("caps T5 collapsed range at $4 so rounding never shows $5", () => {
    const band = formatDisplayTierBandDisplay(
      5,
      bandStat({
        minValueDisplay: 1,
        maxValueDisplay: 5,
        minCoreValueDisplay: 4,
        shelvedCount: 61,
        valuedPlayerCount: 65,
      }),
    );
    expect(displayTierMaxWholeDollar(5)).toBe(4);
    expect(band.rangeLabel).not.toContain("$5");
    expect(band.rangeLabel).toMatch(/\$4/);
    expect(band.shelfNote).toMatch(/61 min-bid/);
  });

  it("shows full $1–$4 when T5 has no core/shelf split", () => {
    const band = formatDisplayTierBandDisplay(
      5,
      bandStat({
        minValueDisplay: 2,
        maxValueDisplay: 4,
        minCoreValueDisplay: 2,
        shelvedCount: 0,
        valuedPlayerCount: 4,
      }),
    );
    expect(band.rangeLabel).toBe("$2–$4");
    expect(band.shelfNote).toBeNull();
  });
});
