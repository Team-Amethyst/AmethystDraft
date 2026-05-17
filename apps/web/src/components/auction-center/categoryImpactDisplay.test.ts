import { describe, expect, it } from "vitest";
import {
  categoryImpactRotoAriaLabel,
  categoryImpactStatusTone,
  formatRotoPointsDelta,
} from "./categoryImpactDisplay";

describe("formatRotoPointsDelta", () => {
  it("formats positive, negative, zero, and singular pt", () => {
    expect(formatRotoPointsDelta("+5 roto pts")).toBe("+5 pts");
    expect(formatRotoPointsDelta("−2 roto pts")).toBe("-2 pts");
    expect(formatRotoPointsDelta("-1 roto pts")).toBe("-1 pt");
    expect(formatRotoPointsDelta("+1 roto pts")).toBe("+1 pt");
    expect(formatRotoPointsDelta("+0 roto pts")).toBe("0 pts");
  });

  it("handles missing roto line", () => {
    expect(formatRotoPointsDelta(null)).toBe("—");
  });
});

describe("categoryImpactStatusTone", () => {
  it("uses plain styling for zero roto points regardless of category effect", () => {
    expect(
      categoryImpactStatusTone({
        improved: true,
        neutral: false,
        rotoPtsLine: "+0 roto pts",
      }),
    ).toBe("plain");
    expect(
      categoryImpactStatusTone({
        improved: false,
        neutral: false,
        rotoPtsLine: "+0 roto pts",
      }),
    ).toBe("plain");
    expect(
      categoryImpactStatusTone({
        improved: true,
        neutral: false,
        rotoPtsLine: "+3 roto pts",
      }),
    ).toBe("green");
  });
});

describe("categoryImpactRotoAriaLabel", () => {
  it("includes direction text for screen readers only", () => {
    expect(
      categoryImpactRotoAriaLabel({
        name: "Wins (W)",
        categoryEffectLabel: "Improves",
        rotoPtsLine: "+3 roto pts",
      }),
    ).toBe("Improves Wins (W) by +3 roto points");
  });
});
