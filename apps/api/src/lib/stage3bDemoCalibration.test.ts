import { describe, expect, it } from "vitest";
import { leagueQualifiesForStage3bDemoOpeningCalibration } from "./stage3bDemoCalibration";

describe("leagueQualifiesForStage3bDemoOpeningCalibration", () => {
  it("matches the Original demo preset only", () => {
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({ name: "Original" }),
    ).toBe(true);
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({ name: "original" }),
    ).toBe(true);
  });

  it("does not match other empty-looking league names", () => {
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({
        name: "[Demo] pre draft",
      }),
    ).toBe(false);
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({ name: "My League" }),
    ).toBe(false);
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({ name: "Original copy" }),
    ).toBe(false);
  });
});
