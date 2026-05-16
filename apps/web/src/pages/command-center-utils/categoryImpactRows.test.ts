import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../../api/roster";
import type { Player } from "../../types/player";
import {
  auctionCenterCategoryImpactRows,
  categoryEffectForLowerRate,
  categoryEffectForSumCategory,
  formatCategoryRotoPointsMessage,
  formatRateMovementStrings,
  rotoPointsDeltaForTeamInCategory,
} from "./categoryImpactRows";
import type { ProjectedStandingsRow } from "./standings";

function basePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p0",
    mlbId: 1,
    name: "Test",
    team: "TST",
    position: "1B",
    age: 27,
    catalog_rank: 50,
    value: 10,
    catalog_tier: 3,
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
    expect(rows[0].categoryEffectLabel).toBe("Improves");
    expect(rows[0].playerContributionStr).toBe("+28");
    expect(rows[0].teamMovementLine).toBe("Team 12 → 40");
    expect(rows[0].rotoPtsLine).toBeNull();
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

describe("formatCategoryRotoPointsMessage", () => {
  it("uses explicit +0 wording instead of implying no stat effect", () => {
    expect(formatCategoryRotoPointsMessage(0)).toBe("+0 roto pts");
  });

  it("formats gains and losses", () => {
    expect(formatCategoryRotoPointsMessage(1)).toBe("+1 roto pt");
    expect(formatCategoryRotoPointsMessage(2)).toBe("+2 roto pts");
    expect(formatCategoryRotoPointsMessage(-1)).toBe("−1 roto pt");
  });
});

describe("formatRateMovementStrings", () => {
  it("adds a fourth decimal for AVG when 3-decimal rounding collides", () => {
    const { beforeStr, afterStr } = formatRateMovementStrings(0.2997, 0.2998, "avg");
    expect(beforeStr).not.toBe(afterStr);
    expect(beforeStr).toContain("2997");
    expect(afterStr).toContain("2998");
  });

  it("keeps 3 decimals when they already differ", () => {
    const { beforeStr, afterStr } = formatRateMovementStrings(0.28, 0.31, "avg");
    expect(beforeStr).toBe("0.280");
    expect(afterStr).toBe("0.310");
  });

  it("adds a third decimal for ERA/WHIP when 2-decimal rounding collides", () => {
    const { beforeStr, afterStr } = formatRateMovementStrings(3.401, 3.402, "lower_rate");
    expect(beforeStr).not.toBe(afterStr);
  });
});

describe("category direction vs roto points", () => {
  it("WHIP worsens but roto points can stay even", () => {
    const catKey = "WHIP";
    const base: ProjectedStandingsRow[] = [
      { teamName: "Mine", stats: { [catKey]: 1.0 } },
      { teamName: "Theirs", stats: { [catKey]: 2.0 } },
    ];
    const withP: ProjectedStandingsRow[] = [
      { teamName: "Mine", stats: { [catKey]: 1.07 } },
      { teamName: "Theirs", stats: { [catKey]: 2.0 } },
    ];
    expect(categoryEffectForLowerRate(1.0, 1.07).label).toBe("Worsens");
    expect(rotoPointsDeltaForTeamInCategory(base, withP, "Mine", catKey, 2)).toBe(0);
  });

  it("ERA improves and gains a roto point when passing the other team", () => {
    const key = "ERA";
    const base: ProjectedStandingsRow[] = [
      { teamName: "Mine", stats: { [key]: 4.0 } },
      { teamName: "Theirs", stats: { [key]: 3.99 } },
    ];
    const withP: ProjectedStandingsRow[] = [
      { teamName: "Mine", stats: { [key]: 3.5 } },
      { teamName: "Theirs", stats: { [key]: 3.99 } },
    ];
    expect(categoryEffectForLowerRate(4.0, 3.5).label).toBe("Improves");
    expect(rotoPointsDeltaForTeamInCategory(base, withP, "Mine", key, 2)).toBe(1);
  });

  it("counting stat increases but roto points can stay even", () => {
    const key = "HR";
    const base: ProjectedStandingsRow[] = [
      { teamName: "Mine", stats: { [key]: 100 } },
      { teamName: "Theirs", stats: { [key]: 200 } },
    ];
    const withP: ProjectedStandingsRow[] = [
      { teamName: "Mine", stats: { [key]: 105 } },
      { teamName: "Theirs", stats: { [key]: 200 } },
    ];
    expect(categoryEffectForSumCategory(100, 105, 5).label).toBe("Improves");
    expect(rotoPointsDeltaForTeamInCategory(base, withP, "Mine", key, 2)).toBe(0);
  });
});
