import { describe, expect, it } from "vitest";
import {
  defaultLogWonByTeamName,
  resolvedLeagueTeamNames,
  resolveUserTeamId,
  teamDisplayNameForTeamId,
  teamIdFromLeagueTeamName,
} from "./team";
import type { League } from "../contexts/LeagueContext";

function makeLeague(): League {
  return {
    id: "l1",
    name: "Test",
    teamNames: ["Alpha", "Bravo", "Charlie"],
    memberIds: ["u-b", "u-a"],
    teams: 3,
    budget: 260,
    rosterSlots: { C: 1, UTIL: 1, BN: 1 },
  } as unknown as League;
}

describe("resolveUserTeamId + log default name alignment", () => {
  it("maps the second member to team_2 and the same display name as defaultLogWonByTeamName", () => {
    const league = makeLeague();
    const tid = resolveUserTeamId(league, "u-a");
    expect(tid).toBe("team_2");
    expect(defaultLogWonByTeamName(league, tid)).toBe("Bravo");
    expect(teamDisplayNameForTeamId(league, tid)).toBe("Bravo");
  });

  it("defaults guest / unknown user to team_1 (matches valuation board default)", () => {
    const league = makeLeague();
    const tid = resolveUserTeamId(league, null);
    expect(tid).toBe("team_1");
    expect(defaultLogWonByTeamName(league, tid)).toBe("Alpha");
  });
});

describe("resolvedLeagueTeamNames letter fallback", () => {
  it("shows Team A not Team 1 when Mongo teamNames empty", () => {
    const league = {
      ...makeLeague(),
      teamNames: [],
      teams: 9,
    } as League;
    expect(resolvedLeagueTeamNames(league)[0]).toBe("Team A");
    expect(resolvedLeagueTeamNames(league)[8]).toBe("Team I");
  });
});

describe("teamIdFromLeagueTeamName", () => {
  it("maps display name to stable team id (case-insensitive)", () => {
    const league = makeLeague();
    expect(teamIdFromLeagueTeamName(league, "bravo ")).toBe("team_2");
    expect(teamIdFromLeagueTeamName(league, "nope")).toBeNull();
  });
});
