import { describe, expect, it } from "vitest";
import {
  displayTierForRawWithConfig,
  REFERENCE_AUCTION_BUDGET,
  resolveDisplayTierConfig,
  scaleTierDollarThreshold,
  userFacingTierTooltip,
} from "./displayTierThresholds";

describe("scaleTierDollarThreshold", () => {
  it("returns reference dollars when budget is invalid", () => {
    expect(scaleTierDollarThreshold(25, 0)).toBe(25);
    expect(scaleTierDollarThreshold(25, Number.NaN)).toBe(25);
  });

  it("scales linearly from the $260 reference", () => {
    expect(scaleTierDollarThreshold(25, 260)).toBe(25);
    expect(scaleTierDollarThreshold(25, 520)).toBe(50);
    expect(scaleTierDollarThreshold(15, 520)).toBe(30);
  });
});

describe("resolveDisplayTierConfig", () => {
  it("keeps default $260 bands unchanged", () => {
    const cfg = resolveDisplayTierConfig(260);
    expect(cfg.leagueBudget).toBe(REFERENCE_AUCTION_BUDGET);
    expect(cfg.bands[0]!.shortRange).toBe("$25+");
    expect(cfg.bands[1]!.shortRange).toBe("$15–$24");
    expect(cfg.bands[4]!.shortRange).toBe("$1–$4");
    expect(displayTierForRawWithConfig(25, cfg)).toBe(1);
    expect(displayTierForRawWithConfig(24.9, cfg)).toBe(2);
    expect(displayTierForRawWithConfig(4, cfg)).toBe(5);
  });

  it("doubles dollar floors for a $520 budget", () => {
    const cfg = resolveDisplayTierConfig(520);
    expect(cfg.bands[0]!.minInclusive).toBe(50);
    expect(cfg.bands[0]!.shortRange).toBe("$50+");
    expect(displayTierForRawWithConfig(50, cfg)).toBe(1);
    expect(displayTierForRawWithConfig(49.9, cfg)).toBe(2);
    expect(displayTierForRawWithConfig(30, cfg)).toBe(2);
    expect(displayTierForRawWithConfig(29.9, cfg)).toBe(3);
  });

  it("defaults to $260 when budget is omitted", () => {
    const cfg = resolveDisplayTierConfig();
    expect(cfg.bands[0]!.minInclusive).toBe(25);
  });
});

describe("userFacingTierTooltip", () => {
  it("mentions scaled budget only for non-reference leagues", () => {
    expect(userFacingTierTooltip(resolveDisplayTierConfig(260))).not.toMatch(
      /scale to a/i,
    );
    expect(userFacingTierTooltip(resolveDisplayTierConfig(520))).toMatch(
      /\$520 league budget/i,
    );
    expect(userFacingTierTooltip(resolveDisplayTierConfig(520))).not.toMatch(
      /%/,
    );
  });
});
