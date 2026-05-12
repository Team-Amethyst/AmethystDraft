import { describe, expect, it } from "vitest";
import {
  positionFilterAfterStatViewChange,
  positionFilterOptionsForStatView,
} from "./playerTablePositions";

describe("positionFilterAfterStatViewChange", () => {
  it("clears pitcher filter when switching to hitters", () => {
    expect(positionFilterAfterStatViewChange("hitting", "P")).toBe("all");
  });

  it("clears batter filter when switching to pitchers", () => {
    expect(positionFilterAfterStatViewChange("pitching", "SS")).toBe("all");
  });

  it("keeps compatible batter filter on hitters", () => {
    expect(positionFilterAfterStatViewChange("hitting", "C")).toBeNull();
  });

  it("keeps P on pitchers view", () => {
    expect(positionFilterAfterStatViewChange("pitching", "P")).toBeNull();
  });
});

describe("positionFilterOptionsForStatView", () => {
  it("lists hitter positions for hitting view", () => {
    expect(positionFilterOptionsForStatView("hitting")).toContain("DH");
    expect(positionFilterOptionsForStatView("hitting")).not.toContain("P");
  });

  it("lists only P for pitching view", () => {
    expect(positionFilterOptionsForStatView("pitching")).toEqual(["P"]);
  });
});
