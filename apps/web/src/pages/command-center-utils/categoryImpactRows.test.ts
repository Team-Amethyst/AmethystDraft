import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../../api/roster";
import type { Player } from "../../types/player";
import { auctionCenterCategoryImpactRows } from "./categoryImpactRows";

function basePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p0",
    mlbId: 1,
    name: "Test",
    team: "TST",
    position: "1B",
    age: 27,
    adp: 50,
    value: 10,
    tier: 3,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...overrides,
  };
}

function baseEntry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    _id: "e0",
    leagueId: "l1",
    userId: "u1",
    teamId: "team_1",
    externalPlayerId: "p-roster",
    playerName: "Roster Guy",
    playerTeam: "TST",
    positions: ["1B"],
    price: 5,
    rosterSlot: "1B",
    isKeeper: false,
    acquiredAt: "2026-01-01",
    createdAt: "2026-01-01",
    ...overrides,
  };
}

describe("auctionCenterCategoryImpactRows", () => {
  it("returns empty when no player", () => {
    expect(
      auctionCenterCategoryImpactRows({
        selectedPlayer: null,
        scoringCategories: [{ name: "Home Runs (HR)", type: "batting" }],
        statView: "hitting",
        myTeamEntries: [],
        allPlayers: [],
      }),
    ).toEqual([]);
  });

  it("returns empty when no scoring categories", () => {
    expect(
      auctionCenterCategoryImpactRows({
        selectedPlayer: basePlayer(),
        scoringCategories: undefined,
        statView: "hitting",
        myTeamEntries: [],
        allPlayers: [],
      }),
    ).toEqual([]);
  });

  it("sum-category row reflects selected player HR in deltaStr", () => {
    const rosterPlayer = basePlayer({
      id: "p-roster",
      stats: {
        batting: {
          avg: ".250",
          hr: 12,
          rbi: 40,
          runs: 50,
          sb: 2,
          obp: ".320",
          slg: ".400",
        },
      },
    });
    const selected = basePlayer({
      id: "p-sel",
      stats: {
        batting: {
          avg: ".280",
          hr: 28,
          rbi: 90,
          runs: 80,
          sb: 5,
          obp: ".350",
          slg: ".500",
        },
      },
    });
    const rows = auctionCenterCategoryImpactRows({
      selectedPlayer: selected,
      scoringCategories: [{ name: "Home Runs (HR)", type: "batting" }],
      statView: "hitting",
      myTeamEntries: [baseEntry()],
      allPlayers: [rosterPlayer],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Home Runs (HR)");
    expect(rows[0].teamPaceStr).toBe("12");
    expect(rows[0].withPlayerStr).toBe("40");
    expect(rows[0].deltaStr).toBe("+28");
    expect(rows[0].improved).toBe(true);
  });

  it("filters to pitching categories when statView is pitching", () => {
    const p = basePlayer({
      id: "p1",
      stats: {
        pitching: {
          era: "3.50",
          whip: "1.10",
          wins: 10,
          saves: 5,
          holds: 2,
          strikeouts: 100,
          innings: "120",
          completeGames: 0,
        },
      },
      projection: {
        pitching: {
          era: "3.50",
          whip: "1.10",
          wins: 10,
          saves: 5,
          holds: 2,
          strikeouts: 100,
          completeGames: 0,
          innings: 120,
        },
      },
    });
    const rows = auctionCenterCategoryImpactRows({
      selectedPlayer: p,
      scoringCategories: [
        { name: "Home Runs (HR)", type: "batting" },
        { name: "Strikeouts (K)", type: "pitching" },
      ],
      statView: "pitching",
      myTeamEntries: [],
      allPlayers: [],
    });
    expect(rows.map((r) => r.name)).toEqual(["Strikeouts (K)"]);
  });
});
