import { describe, expect, it } from "vitest";
import { AL_TEAMS, NL_TEAMS, teamAbbrev } from "./mlbTeams";

describe("teamAbbrev", () => {
  it("uses split abbreviation when present", () => {
    expect(teamAbbrev({ id: 0, abbreviation: "LAD" })).toBe("LAD");
  });

  it("falls back to known team-id mapping", () => {
    expect(teamAbbrev({ id: 147 })).toBe("NYY");
  });

  it("returns placeholder when unknown", () => {
    expect(teamAbbrev({ id: 999 })).toBe("--");
  });
});

describe("league pools", () => {
  it("contains expected AL and NL team abbreviations", () => {
    expect(AL_TEAMS.has("NYY")).toBe(true);
    expect(NL_TEAMS.has("LAD")).toBe(true);
    expect(AL_TEAMS.has("LAD")).toBe(false);
  });
});
