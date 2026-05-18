import { describe, expect, it } from "vitest";
import type { Player } from "../../types/player";
import {
  buildProjectedStandings,
  compareProjectedStandingsRows,
  computeRanks,
  computeTeamRotoSummaries,
  formatTeamRotoSummaryLine,
  getProjStat,
  ROTO_POINTS_SORT_KEY,
  rotoPointsForRank,
  teamBattingRatePaceForCategory,
  teamPitchingRatePaceForCategory,
  totalRotoPointsForTeam,
} from "./standings";
import {
  teamAvgFromHitsAb,
  teamEraFromDerivedEarnedRuns,
  teamWhipFromDerivedBaserunners,
} from "./categoryImpactAudit";

function pitcher(
  id: string,
  era: number,
  whip: number,
  ip: number,
  k = 0,
): Player {
  return {
    id,
    mlbId: 1,
    name: id,
    team: "TST",
    position: "SP",
    age: 27,
    catalog_rank: 50,
    value: 10,
    catalog_tier: 3,
    headshot: "",
    outlook: "",
    stats: {
      pitching: {
        era: String(era),
        whip: String(whip),
        wins: 0,
        saves: 0,
        holds: 0,
        strikeouts: k,
        innings: String(ip),
        completeGames: 0,
      },
    },
    projection: {
      pitching: {
        era: String(era),
        whip: String(whip),
        wins: 0,
        saves: 0,
        holds: 0,
        strikeouts: k,
        innings: ip,
        completeGames: 0,
      },
    },
  };
}

describe("teamPitchingRatePaceForCategory", () => {
  it("matches ERA = 9×ΣER/ΣIP from rate×IP derivation (not naive sum or average)", () => {
    const team = [pitcher("a", 3.0, 1.0, 100), pitcher("b", 5.0, 1.5, 50)];
    const pace = teamPitchingRatePaceForCategory(team, "ERA");
    const derived = teamEraFromDerivedEarnedRuns(team);
    expect(pace).toBeCloseTo(derived, 8);
    expect(pace).toBeCloseTo((3 * 100 + 5 * 50) / 150, 8);
    expect(pace).not.toBeCloseTo(3 + 5, 1);
    expect(pace).not.toBeCloseTo((3 + 5) / 2, 1);
  });

  it("matches WHIP = Σ(BB+H)/ΣIP from whip×IP derivation", () => {
    const team = [pitcher("a", 4.0, 1.1, 120), pitcher("b", 4.0, 1.3, 80)];
    const pace = teamPitchingRatePaceForCategory(team, "WHIP");
    const derived = teamWhipFromDerivedBaserunners(team);
    expect(pace).toBeCloseTo(derived, 8);
    expect(pace).toBeCloseTo((1.1 * 120 + 1.3 * 80) / 200, 8);
  });

  it("falls back to unweighted mean when all pitchers lack IP", () => {
    const noIp: Player = {
      ...pitcher("x", 3.0, 1.2, 0),
      projection: {
        pitching: {
          era: "3.00",
          whip: "1.20",
          wins: 0,
          saves: 0,
          holds: 0,
          strikeouts: 0,
          innings: 0,
          completeGames: 0,
        },
      },
    };
    const team = [noIp, { ...noIp, id: "y", projection: { ...noIp.projection!, pitching: { ...noIp.projection!.pitching!, era: "5.00", whip: "1.50" } } }];
    expect(teamPitchingRatePaceForCategory(team, "ERA")).toBeCloseTo(4, 8);
  });
});

describe("teamBattingRatePaceForCategory", () => {
  it("uses ΣH/ΣAB for AVG when components exist", () => {
    const p1: Player = {
      id: "b1",
      mlbId: 1,
      name: "B1",
      team: "TST",
      position: "1B",
      age: 27,
      catalog_rank: 50,
      value: 10,
      catalog_tier: 3,
      headshot: "",
      outlook: "",
      projection: { batting: { avg: ".300", hr: 10, rbi: 50, runs: 60, sb: 2, ab: 400, hits: 120 } },
      stats: {},
    };
    const p2: Player = {
      ...p1,
      id: "b2",
      projection: { batting: { avg: ".250", hr: 5, rbi: 40, runs: 50, sb: 1, ab: 200, hits: 40 } },
    };
    const pace = teamBattingRatePaceForCategory([p1, p2], "AVG");
    expect(pace).toBeCloseTo(160 / 600, 8);
    expect(pace).toBeCloseTo(teamAvgFromHitsAb([p1, p2]), 8);
    expect(pace).not.toBeCloseTo((0.3 + 0.25) / 2, 3);
  });
});

describe("buildProjectedStandings + computeRanks", () => {
  it("sums counting stats per team and ranks higher-is-better", () => {
    const batter = (id: string, hr: number): Player => ({
      id,
      mlbId: 1,
      name: id,
      team: "TST",
      position: "1B",
      age: 27,
      catalog_rank: 50,
      value: 10,
      catalog_tier: 3,
      headshot: "",
      outlook: "",
      stats: {},
      projection: { batting: { avg: ".250", hr, rbi: 0, runs: 0, sb: 0 } },
    });
    const entries = [
      { teamId: "team_1", externalPlayerId: "a" },
      { teamId: "team_2", externalPlayerId: "b" },
    ] as Parameters<typeof buildProjectedStandings>[1];
    const map = new Map<string, Player>([
      ["a", batter("a", 50)],
      ["b", batter("b", 80)],
    ]);
    const rows = buildProjectedStandings(
      ["Team A", "Team B"],
      entries,
      map,
      [{ name: "HR", type: "batting" }],
    );
    expect(rows[0].stats.HR).toBe(50);
    expect(rows[1].stats.HR).toBe(80);
    const ranks = computeRanks(rows, "HR");
    expect(ranks.get("Team A")).toBe(2);
    expect(ranks.get("Team B")).toBe(1);
  });
});

describe("roto points totals", () => {
  it("sums category roto points for a team", () => {
    const rows = [
      { teamName: "A", stats: { HR: 10, RBI: 50 } },
      { teamName: "B", stats: { HR: 80, RBI: 40 } },
    ];
    const cats = [
      { name: "HR", type: "batting" as const },
      { name: "RBI", type: "batting" as const },
    ];
    const rankMaps = Object.fromEntries(
      cats.map((c) => [c.name, computeRanks(rows, c.name)]),
    );
    expect(totalRotoPointsForTeam("A", cats, rankMaps, 2)).toBe(
      rotoPointsForRank(2, 2) + rotoPointsForRank(1, 2),
    );
    expect(totalRotoPointsForTeam("B", cats, rankMaps, 2)).toBe(
      rotoPointsForRank(1, 2) + rotoPointsForRank(2, 2),
    );
  });

  it("assigns overall rank by total points descending", () => {
    const rows = [
      { teamName: "Low", stats: { HR: 1 } },
      { teamName: "High", stats: { HR: 99 } },
    ];
    const cats = [{ name: "HR", type: "batting" as const }];
    const rankMaps = { HR: computeRanks(rows, "HR") };
    const summaries = computeTeamRotoSummaries(
      ["Low", "High"],
      cats,
      rankMaps,
    );
    expect(summaries.get("High")?.overallRank).toBe(1);
    expect(summaries.get("Low")?.overallRank).toBe(2);
    expect(formatTeamRotoSummaryLine(summaries.get("High")!, 2)).toBe(
      "2 pts · 1st / 2",
    );
  });

  it("sorts standings by Pts descending by default", () => {
    const rows = [
      { teamName: "A", stats: { HR: 1 } },
      { teamName: "B", stats: { HR: 50 } },
    ];
    const cats = [{ name: "HR", type: "batting" as const }];
    const rankMaps = { HR: computeRanks(rows, "HR") };
    const summaries = computeTeamRotoSummaries(["A", "B"], cats, rankMaps);
    const sorted = [...rows].sort((a, b) =>
      compareProjectedStandingsRows(a, b, ROTO_POINTS_SORT_KEY, false, summaries),
    );
    expect(sorted.map((r) => r.teamName)).toEqual(["B", "A"]);
  });
});

describe("getProjStat counting", () => {
  it("adds strikeouts and wins from projection", () => {
    const p = pitcher("k", 4, 1.2, 100, 171);
    p.projection!.pitching!.wins = 9;
    expect(getProjStat(p, "K", "pitching")).toBe(171);
    expect(getProjStat(p, "W", "pitching")).toBe(9);
  });
});
