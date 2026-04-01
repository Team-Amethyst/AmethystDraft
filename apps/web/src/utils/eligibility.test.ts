import { describe, expect, it } from "vitest";
import {
  getEligibleSlotsForPosition,
  getEligibleSlotsForPositions,
  hasPitcherEligibility,
  normalizePlayerPositions,
  slotAllowsPosition,
} from "./eligibility";

describe("normalizePlayerPositions", () => {
  it("normalizes OF variants and de-duplicates positions", () => {
    expect(normalizePlayerPositions(["LF", "CF", "OF"]))
      .toEqual(["OF"]);
  });

  it("falls back to primary position when positions list is absent", () => {
    expect(normalizePlayerPositions(undefined, "2B/OF"))
      .toEqual(["2B", "OF"]);
  });

  it("maps TWP to both pitcher and hitter eligibility", () => {
    expect(normalizePlayerPositions(["TWP"]))
      .toEqual(["SP", "DH"]);
  });
});

describe("slotAllowsPosition", () => {
  it("allows hitters into UTIL but not pitchers", () => {
    expect(slotAllowsPosition("UTIL", "1B")).toBe(true);
    expect(slotAllowsPosition("UTIL", "SP")).toBe(false);
  });

  it("allows generic P into SP and RP slots", () => {
    expect(slotAllowsPosition("SP", "P")).toBe(true);
    expect(slotAllowsPosition("RP", "P")).toBe(true);
    expect(slotAllowsPosition("P", "P")).toBe(true);
  });

  it("supports CI and MI composite slots", () => {
    expect(slotAllowsPosition("CI", "1B")).toBe(true);
    expect(slotAllowsPosition("CI", "3B")).toBe(true);
    expect(slotAllowsPosition("MI", "2B")).toBe(true);
    expect(slotAllowsPosition("MI", "SS")).toBe(true);
  });
});

describe("eligible slot helpers", () => {
  const slots = ["C", "1B", "2B", "SS", "3B", "CI", "MI", "OF", "UTIL", "SP", "RP", "P", "BN"];

  it("uses full eligible positions array when present", () => {
    expect(getEligibleSlotsForPositions(["2B", "OF"], slots))
      .toEqual(["2B", "MI", "OF", "UTIL", "BN"]);
  });

  it("falls back to primary position string when needed", () => {
    expect(getEligibleSlotsForPositions(undefined, slots, "1B/3B"))
      .toEqual(["1B", "3B", "CI", "UTIL", "BN"]);
  });

  it("preserves pitcher eligibility for TWP", () => {
    expect(getEligibleSlotsForPosition("TWP", slots))
      .toEqual(["UTIL", "SP", "P", "BN"]);
  });
});

describe("hasPitcherEligibility", () => {
  it("detects pitcher eligibility from either positions or fallback", () => {
    expect(hasPitcherEligibility(["SP"])).toBe(true);
    expect(hasPitcherEligibility(undefined, "RP")).toBe(true);
    expect(hasPitcherEligibility(["OF", "1B"])).toBe(false);
  });
});