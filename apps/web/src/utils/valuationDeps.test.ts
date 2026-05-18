import { describe, expect, it } from "vitest";
import type { League } from "../contexts/LeagueContext";
import {
  leagueValuationConfigKey,
  openingBoardCalibrationCacheProfile,
} from "./valuationDeps";

function minimalLeague(overrides: Partial<League> = {}): League {
  return {
    id: "L1",
    name: "Friendly",
    teams: 12,
    budget: 260,
    rosterSlots: {},
    scoringCategories: [],
    memberIds: [],
    posEligibilityThreshold: 20,
    playerPool: "mixed",
    teamNames: [],
    ...overrides,
  } as League;
}

describe("openingBoardCalibrationCacheProfile", () => {
  it("maps Original (case-insensitive) to stage3b_demo_v1", () => {
    expect(openingBoardCalibrationCacheProfile(minimalLeague({ name: "Original" }))).toBe(
      "stage3b_demo_v1",
    );
    expect(openingBoardCalibrationCacheProfile(minimalLeague({ name: " original " }))).toBe(
      "stage3b_demo_v1",
    );
  });

  it("maps all other league names to fresh_board_linear", () => {
    expect(openingBoardCalibrationCacheProfile(minimalLeague({ name: "[Demo] pre draft" }))).toBe(
      "fresh_board_linear",
    );
    expect(openingBoardCalibrationCacheProfile(minimalLeague({ name: "Friendly" }))).toBe(
      "fresh_board_linear",
    );
  });
});

describe("leagueValuationConfigKey", () => {
  it("includes opening_board_calibration derived from league name", () => {
    const original = JSON.parse(
      leagueValuationConfigKey(minimalLeague({ id: "A", name: "Original" })),
    );
    const demo = JSON.parse(
      leagueValuationConfigKey(minimalLeague({ id: "B", name: "[Demo] pre draft" })),
    );
    expect(original.opening_board_calibration).toBe("stage3b_demo_v1");
    expect(demo.opening_board_calibration).toBe("fresh_board_linear");
    expect(original).not.toEqual(demo);
  });

  it("changes config key when league is renamed between calibration profiles", () => {
    const before = leagueValuationConfigKey(
      minimalLeague({ id: "same", name: "My League" }),
    );
    const after = leagueValuationConfigKey(
      minimalLeague({ id: "same", name: "Original" }),
    );
    expect(before).not.toBe(after);
  });
});
