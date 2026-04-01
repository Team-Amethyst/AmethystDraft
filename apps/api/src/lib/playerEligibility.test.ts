import { describe, expect, it } from "vitest";
import {
  isPitchingPosition,
  normalizeFantasyPosition,
  resolveEligiblePositions,
} from "./playerEligibility";

describe("normalizeFantasyPosition", () => {
  it("normalizes OF variants to OF", () => {
    expect(normalizeFantasyPosition("LF", "hitting")).toBe("OF");
    expect(normalizeFantasyPosition("CF", "hitting")).toBe("OF");
    expect(normalizeFantasyPosition("RF", "hitting")).toBe("OF");
  });

  it("disambiguates two-way players by stat group", () => {
    expect(normalizeFantasyPosition("TWP", "pitching")).toBe("SP");
    expect(normalizeFantasyPosition("TWP", "hitting")).toBe("DH");
  });

  it("preserves IF instead of collapsing it to UTIL", () => {
    expect(normalizeFantasyPosition("IF", "hitting")).toBe("IF");
  });
});

describe("resolveEligiblePositions", () => {
  it("prefers filtered fielding positions when present", () => {
    expect(resolveEligiblePositions(["2B", "OF", "SP"], "SS", "hitting"))
      .toEqual(["2B", "OF"]);
    expect(resolveEligiblePositions(["2B", "RP", "SP"], "SP", "pitching"))
      .toEqual(["RP", "SP"]);
  });

  it("falls back to normalized primary position when no fielding positions match", () => {
    expect(resolveEligiblePositions(["SP"], "1B", "hitting"))
      .toEqual(["1B"]);
    expect(resolveEligiblePositions(undefined, "TWP", "pitching"))
      .toEqual(["SP"]);
  });
});

describe("isPitchingPosition", () => {
  it("recognizes canonical pitcher positions", () => {
    expect(isPitchingPosition("SP")).toBe(true);
    expect(isPitchingPosition("RP")).toBe(true);
    expect(isPitchingPosition("P")).toBe(true);
    expect(isPitchingPosition("OF")).toBe(false);
  });
});