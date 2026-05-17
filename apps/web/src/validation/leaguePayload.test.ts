import { describe, expect, it } from "vitest";
import {
  LEAGUE_TEAMS_MIN,
  validateLeaguePayload,
} from "./leaguePayload";

describe("validateLeaguePayload", () => {
  const validBase = {
    name: "My League",
    teams: 12,
    budget: 260,
    playerPool: "Mixed",
    scoringCategories: [{ name: "HR", type: "batting" as const }],
    rosterSlots: { OF: 3 },
  };

  it("rejects fewer than minimum teams with a clear message", () => {
    const result = validateLeaguePayload({ ...validBase, teams: 1 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors.teams).toContain(String(LEAGUE_TEAMS_MIN));
      expect(result.message).toContain("teams:");
    }
  });

  it("rejects empty league name", () => {
    const result = validateLeaguePayload({ ...validBase, name: "   " });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors.name).toBeTruthy();
    }
  });

  it("accepts a valid payload", () => {
    expect(validateLeaguePayload(validBase).valid).toBe(true);
  });
});
