import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../../api/roster";
import {
  auditCategoryImpactForPlayer,
  buildWillWarrenAuditFixture,
  teamEraFromDerivedEarnedRuns,
  teamWhipFromDerivedBaserunners,
} from "./categoryImpactAudit";
import { auctionCenterCategoryImpactRows } from "./categoryImpactRows";
import {
  teamPitchingRatePaceForCategory,
} from "./standings";
import { filterActiveAuctionEntries } from "./roster";
import type { Player } from "../../types/player";

const PITCHING_CATS = [
  { name: "Wins (W)", type: "pitching" as const },
  { name: "Strikeouts (K)", type: "pitching" as const },
  { name: "ERA", type: "pitching" as const },
  { name: "WHIP", type: "pitching" as const },
];

function entry(teamId: string, playerId: string): RosterEntry {
  return {
    _id: `e-${playerId}`,
    leagueId: "l1",
    userId: "u1",
    teamId,
    externalPlayerId: playerId,
    playerName: playerId,
    playerTeam: "TST",
    positions: ["SP"],
    price: 1,
    rosterSlot: "SP",
    isKeeper: false,
    acquiredAt: "",
    createdAt: "",
  };
}

describe("Will Warren screenshot sanity (fixture)", () => {
  it("reproduces ~3.78→3.91 ERA and ~1.10→1.16 WHIP via IP-weighted team rates", () => {
    const { myPitchers, warren } = buildWillWarrenAuditFixture();
    const beforeEra = teamPitchingRatePaceForCategory(myPitchers, "ERA");
    const afterEra = teamPitchingRatePaceForCategory([...myPitchers, warren], "ERA");
    const beforeWhip = teamPitchingRatePaceForCategory(myPitchers, "WHIP");
    const afterWhip = teamPitchingRatePaceForCategory([...myPitchers, warren], "WHIP");

    expect(beforeEra).toBeCloseTo(3.78, 2);
    expect(afterEra).toBeCloseTo(3.91, 2);
    expect(beforeWhip).toBeCloseTo(1.1, 2);
    expect(afterWhip).toBeCloseTo(1.16, 2);

    expect(beforeEra).toBeCloseTo(teamEraFromDerivedEarnedRuns(myPitchers), 6);
    expect(afterEra).toBeCloseTo(teamEraFromDerivedEarnedRuns([...myPitchers, warren]), 6);
    expect(beforeWhip).toBeCloseTo(teamWhipFromDerivedBaserunners(myPitchers), 6);
    expect(afterWhip).toBeCloseTo(teamWhipFromDerivedBaserunners([...myPitchers, warren]), 6);
  });

  it("category cards show K 614→785 and Warren +9 W with plausible roto lines", () => {
    const { myPitchers, warren, leaguePitchers } = buildWillWarrenAuditFixture();
    const myEntries = myPitchers.map((p) => entry("team_1", p.id));
    const rivalPlayers: Player[] = leaguePitchers.map((r, i) => ({
      id: `rival-${i}`,
      mlbId: 900 + i,
      name: r.teamName,
      team: "TST",
      position: "SP",
      age: 28,
      catalog_rank: 50,
      value: 5,
      catalog_tier: 4,
      headshot: "",
      outlook: "",
      projection: {
        pitching: {
          era: "4.00",
          whip: String(r.whip),
          wins: 10,
          saves: 0,
          holds: 0,
          strikeouts: 500,
          innings: 600,
          completeGames: 0,
        },
      },
      stats: {},
    }));
    const rivalEntries = rivalPlayers.map((p, i) => entry(`team_${i + 2}`, p.id));

    const rows = auctionCenterCategoryImpactRows({
      selectedPlayer: warren,
      scoringCategories: PITCHING_CATS,
      statView: "pitching",
      myTeamEntries: myEntries,
      allPlayers: [...myPitchers, warren, ...rivalPlayers],
      rosterImpact: {
        leagueTeamNames: ["Mine", ...leaguePitchers.map((r) => r.teamName)],
        fullRosterEntries: filterActiveAuctionEntries([...myEntries, ...rivalEntries]),
        myTeamId: "team_1",
        myTeamName: "Mine",
        draftedIds: new Set(),
        leagueId: "l1",
        userId: "u1",
      },
    });

    const kRow = rows.find((r) => r.name.includes("K"));
    const wRow = rows.find((r) => r.name.includes("Wins"));
    const eraRow = rows.find((r) => r.name === "ERA");
    const whipRow = rows.find((r) => r.name === "WHIP");

    expect(kRow?.teamMovementLine).toBe("614 → 785");
    expect(kRow?.playerContributionStr).toBe("+171");
    expect(wRow?.teamMovementLine).toBe("40 → 49");
    expect(wRow?.playerContributionStr).toBe("+9");
    expect(eraRow?.teamMovementLine).toMatch(/^3\.78 → 3\.9[12]$/);
    expect(whipRow?.teamMovementLine).toBe("1.10 → 1.16");
    expect(eraRow?.categoryEffectLabel).toBe("Worsens");
    expect(whipRow?.categoryEffectLabel).toBe("Worsens");
  });

  it("WHIP roto delta is negative when adding Warren drops WHIP rank among rivals", () => {
    const { myPitchers, warren, leaguePitchers } = buildWillWarrenAuditFixture();
    const myEntries = myPitchers.map((p) => entry("team_1", p.id));
    const rivalPlayers: Player[] = leaguePitchers.map((r, i) => ({
      id: `rival-${i}`,
      mlbId: 900 + i,
      name: r.teamName,
      team: "TST",
      position: "SP",
      age: 28,
      catalog_rank: 50,
      value: 5,
      catalog_tier: 4,
      headshot: "",
      outlook: "",
      projection: {
        pitching: {
          era: "4.00",
          whip: String(r.whip),
          wins: 10,
          saves: 0,
          holds: 0,
          strikeouts: 500,
          innings: 600,
          completeGames: 0,
        },
      },
      stats: {},
    }));
    const rivalEntries = rivalPlayers.map((p, i) => entry(`team_${i + 2}`, p.id));
    const audit = auditCategoryImpactForPlayer({
      selectedPlayer: warren,
      scoringCategories: PITCHING_CATS,
      statView: "pitching",
      myTeamEntries: myEntries,
      allPlayers: [...myPitchers, warren, ...rivalPlayers],
      rosterImpact: {
        leagueTeamNames: ["Mine", ...leaguePitchers.map((r) => r.teamName)],
        fullRosterEntries: [...myEntries, ...rivalEntries],
        myTeamId: "team_1",
        myTeamName: "Mine",
        draftedIds: new Set(),
        leagueId: "l1",
        userId: "u1",
      },
    });
    const whip = audit.find((r) => r.category === "WHIP");
    expect(whip?.rankAfter).toBeGreaterThan(whip?.rankBefore ?? 0);
    expect(whip?.rotoDelta).not.toBeNull();
    expect(whip!.rotoDelta!).toBeLessThan(0);
  });
});

describe("double-count and toggle guards", () => {
  it("skips roto sim when player already on my active roster", () => {
    const warren = buildWillWarrenAuditFixture().warren;
    const rows = auctionCenterCategoryImpactRows({
      selectedPlayer: warren,
      scoringCategories: PITCHING_CATS,
      statView: "pitching",
      myTeamEntries: [entry("team_1", warren.id)],
      allPlayers: [warren],
      rosterImpact: {
        leagueTeamNames: ["Mine", "Other"],
        fullRosterEntries: [entry("team_1", warren.id)],
        myTeamId: "team_1",
        myTeamName: "Mine",
        draftedIds: new Set(),
        leagueId: "l1",
        userId: "u1",
      },
    });
    expect(rows.every((r) => r.rotoPtsLine === null)).toBe(true);
  });

  it("hitting toggle excludes pitching categories", () => {
    const p = buildWillWarrenAuditFixture().warren;
    const rows = auctionCenterCategoryImpactRows({
      selectedPlayer: p,
      scoringCategories: [
        { name: "Home Runs (HR)", type: "batting" },
        { name: "ERA", type: "pitching" },
      ],
      statView: "hitting",
      myTeamEntries: [],
      allPlayers: [p],
    });
    expect(rows.map((r) => r.name)).toEqual(["Home Runs (HR)"]);
  });
});
