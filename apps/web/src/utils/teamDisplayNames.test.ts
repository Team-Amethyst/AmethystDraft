import { describe, it, expect } from "vitest";
import type { League } from "../contexts/LeagueContext";
import { computeTeamData } from "../pages/command-center-utils/roster";
import {
  resolvedLeagueTeamNames,
  teamDisplayNameForTeamId,
  teamIdFromLeagueTeamName,
} from "./team";

function demoLeague(teamNames: string[]): League {
  return {
    id: "l1",
    name: "Demo",
    teams: 9,
    teamNames,
    budget: 260,
    rosterSlots: { OF: 1, BN: 1 },
    memberIds: [],
  } as unknown as League;
}

describe("resolvedLeagueTeamNames", () => {
  it("uses Mongo teamNames when present", () => {
    const names = [
      "Team A",
      "Team B",
      "Team C",
      "Team D",
      "Team E",
      "Team F",
      "Team G",
      "Team H",
      "Team I",
    ];
    expect(resolvedLeagueTeamNames(demoLeague(names))).toEqual(names);
  });

  it("falls back to letter labels when teamNames empty", () => {
    expect(resolvedLeagueTeamNames(demoLeague([]))[0]).toBe("Team A");
    expect(resolvedLeagueTeamNames(demoLeague([]))[8]).toBe("Team I");
  });

  it("maps team_6 to Team F for display", () => {
    const league = demoLeague([
      "Team A",
      "Team B",
      "Team C",
      "Team D",
      "Team E",
      "Team F",
      "Team G",
      "Team H",
      "Team I",
    ]);
    expect(teamDisplayNameForTeamId(league, "team_6")).toBe("Team F");
    expect(teamIdFromLeagueTeamName(league, "Team F")).toBe("team_6");
  });
});

describe("computeTeamData", () => {
  it("labels teams from resolved display names", () => {
    const league = demoLeague(["Team A", "Team B"]);
    league.teams = 2;
    const rows = computeTeamData(league, []);
    expect(rows.map((r) => r.name)).toEqual(["Team A", "Team B"]);
  });
});
