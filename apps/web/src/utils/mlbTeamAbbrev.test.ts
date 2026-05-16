import { describe, it, expect } from "vitest";
import { formatMlbTeamAbbrev } from "./mlbTeamAbbrev";

describe("formatMlbTeamAbbrev", () => {
  it("returns canonical abbrev for codes and full names", () => {
    expect(formatMlbTeamAbbrev("CHC")).toBe("CHC");
    expect(formatMlbTeamAbbrev("ari")).toBe("AZ");
    expect(formatMlbTeamAbbrev("Los Angeles Dodgers")).toBe("LAD");
  });

  it("returns null when team is unknown or empty", () => {
    expect(formatMlbTeamAbbrev("")).toBeNull();
    expect(formatMlbTeamAbbrev("   ")).toBeNull();
  });
});
