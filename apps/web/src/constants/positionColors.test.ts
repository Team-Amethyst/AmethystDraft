import { describe, expect, it } from "vitest";
import { positionColorStyle } from "./positionColors";

describe("positionColorStyle", () => {
  it("normalizes case", () => {
    expect(positionColorStyle("c").color).toBe(positionColorStyle("C").color);
  });

  it("returns default for unknown slots", () => {
    expect(positionColorStyle("XX").color).toBe("#a78bfa");
  });

  it("matches roster plan keys used in My Draft", () => {
    for (const pos of ["C", "1B", "2B", "SS", "3B", "OF", "SP", "RP", "UTIL", "BN"]) {
      expect(positionColorStyle(pos).color).toMatch(/^#/);
    }
  });
});
