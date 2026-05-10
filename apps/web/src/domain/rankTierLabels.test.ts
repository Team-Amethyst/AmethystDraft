import { describe, expect, it } from "vitest";
import {
  marketAdpDetailTooltip,
  marketAdpTooltip,
} from "./rankTierLabels";

describe("marketAdpTooltip", () => {
  it("includes source when provided", () => {
    expect(marketAdpTooltip("NFBC")).toBe(
      "External average draft position from NFBC.",
    );
  });

  it("omits provider name when source is missing or blank", () => {
    expect(marketAdpTooltip()).toBe("External average draft position.");
    expect(marketAdpTooltip("")).toBe("External average draft position.");
    expect(marketAdpTooltip("   ")).toBe("External average draft position.");
  });
});

describe("marketAdpDetailTooltip", () => {
  it("appends updated sentence when market_adp_updated_at parses", () => {
    const t = marketAdpDetailTooltip({
      market_adp_source: "NFBC",
      market_adp_updated_at: "2026-04-20T08:00:00.000Z",
    });
    expect(t.startsWith("External average draft position from NFBC.")).toBe(
      true,
    );
    expect(t).toMatch(/\bUpdated\b/);
  });

  it("ignores invalid updated_at", () => {
    expect(
      marketAdpDetailTooltip({
        market_adp_source: "X",
        market_adp_updated_at: "not-a-date",
      }),
    ).toBe("External average draft position from X.");
  });

  it("handles nullish fields", () => {
    expect(marketAdpDetailTooltip(null)).toBe(
      "External average draft position.",
    );
  });

  it("appends range and sample size when Engine sends bounds and pick count", () => {
    const t = marketAdpDetailTooltip({
      market_adp_source: "NFBC",
      market_adp_min: 10,
      market_adp_max: 14,
      market_pick_count: 99.6,
    });
    expect(t).toContain("Range 10–14.");
    expect(t).toContain("Sample size: 100 picks.");
  });
});
