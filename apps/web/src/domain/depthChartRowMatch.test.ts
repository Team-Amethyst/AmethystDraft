import { describe, it, expect } from "vitest";
import type { DepthChartPlayerRow, DepthChartResponse } from "../api/players";
import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import {
  buildDepthRowResolutionCache,
  computeDepthChartMatchSummary,
  depthRowMatchesSearch,
  getDepthRowResolution,
  resolveCatalogMatchForDepthRow,
  resolveDepthRowMatch,
  depthRowIdentityKey,
} from "./depthChartRowMatch";

function mockRow(overrides: Partial<DepthChartPlayerRow> = {}): DepthChartPlayerRow {
  return {
    rank: 1,
    playerId: 100,
    playerName: "Test Player",
    primaryPosition: "SP",
    status: "Active",
    usageStarts: 1,
    usageAppearances: 7,
    outOfPosition: false,
    needsManualReview: false,
    reasons: [],
    ...overrides,
  };
}

function mockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-100",
    mlbId: 100,
    name: "Test Player",
    team: "NYY",
    position: "SP",
    age: 25,
    catalog_rank: 1,
    value: 10,
    catalog_tier: 2,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...overrides,
  };
}

function mockRoster(externalId: string): RosterEntry {
  return {
    _id: "r1",
    userId: "u",
    leagueId: "l",
    teamId: "t",
    externalPlayerId: externalId,
    playerName: "Test Player",
    playerTeam: "NYY",
    positions: ["SP"],
    price: 1,
    rosterSlot: "SP",
    isKeeper: false,
    acquiredAt: "",
    createdAt: "",
  };
}

function mockDepthChart(
  byPosition: Record<string, DepthChartPlayerRow[]>,
): DepthChartResponse {
  return {
    teamId: 147,
    generatedAt: new Date().toISOString(),
    season: 2026,
    rosterCount: 26,
    rosterLimit: 26,
    positions: {
      SP: [],
      RP: [],
      C: [],
      "1B": [],
      "2B": [],
      "3B": [],
      SS: [],
      LF: [],
      CF: [],
      RF: [],
      DH: [],
      ...byPosition,
    },
    manualReview: [],
    constraints: { rosterLimitRespected: true, note: "OK" },
  };
}

describe("depthChartRowMatch", () => {
  it("prefers exact MLB ID over normalized name fallback", () => {
    const row = mockRow({ playerId: 200, playerName: "Aaron Judge" });
    const catalog = [
      mockPlayer({ id: "wrong", mlbId: 999, name: "Aaron Judge", team: "NYY" }),
      mockPlayer({ id: "right", mlbId: 200, name: "Different Name", team: "NYY" }),
    ];
    const match = resolveCatalogMatchForDepthRow(catalog, row, "NYY");
    expect(match.method).toBe("exact_mlb_id");
    expect(match.player?.id).toBe("right");
    expect(match.confidence).toBe("high");
  });

  it("uses normalized name + team when MLB ID misses", () => {
    const row = mockRow({ playerId: 555, playerName: "Will Warren" });
    const catalog = [mockPlayer({ id: "w", mlbId: 999, name: "Will Warren", team: "NYY" })];
    const match = resolveCatalogMatchForDepthRow(catalog, row, "NYY");
    expect(match.method).toBe("normalized_name_and_team");
    expect(match.player?.id).toBe("w");
  });

  it("shows Rostered only when on fantasy roster", () => {
    const row = mockRow();
    const catalog = [mockPlayer()];
    const state = resolveDepthRowMatch(
      row,
      "SP",
      "NYY",
      catalog,
      [mockRoster("100")],
      [],
      new Map(),
    ).state;
    expect(state).toBe("rostered");
  });

  it("shows Valued for catalog + valuation row, not on roster", () => {
    const row = mockRow();
    const catalog = [mockPlayer()];
    const valuations = new Map([["p-100", { auction_value: 12 }]]);
    expect(
      resolveDepthRowMatch(row, "SP", "NYY", catalog, [], [], valuations).state,
    ).toBe("valued");
  });

  it("shows Catalog only when catalog exists without valuation", () => {
    const row = mockRow();
    const catalog = [mockPlayer()];
    expect(
      resolveDepthRowMatch(row, "SP", "NYY", catalog, [], [], new Map()).state,
    ).toBe("catalog_only");
  });

  it("shows Depth only when no catalog match", () => {
    expect(
      resolveDepthRowMatch(mockRow(), "SP", "NYY", [], [], [], new Map()).state,
    ).toBe("depth_only");
  });

  it("shows Unmatched when identity is missing", () => {
    expect(
      resolveDepthRowMatch(
        mockRow({ playerId: 0, playerName: "  " }),
        "SP",
        "NYY",
        [],
        [],
        [],
        new Map(),
      ).state,
    ).toBe("unmatched");
  });

  it("uses consistent match state for duplicate depth appearances", () => {
    const judge = mockRow({ playerId: 592450, playerName: "Aaron Judge", rank: 1 });
    const judgeCf = { ...judge, rank: 2 as const };
    const chart = mockDepthChart({ LF: [judge], CF: [judgeCf] });
    const cache = buildDepthRowResolutionCache(
      chart,
      "NYY",
      [mockPlayer({ id: "j", mlbId: 592450, name: "Aaron Judge", team: "NYY" })],
      [],
      [],
      new Map([["j", { auction_value: 40 }]]),
    );
    const lf = getDepthRowResolution(cache, judge, "LF", "NYY", [], [], [], new Map());
    const cf = getDepthRowResolution(cache, judgeCf, "CF", "NYY", [], [], [], new Map());
    expect(lf.state).toBe("valued");
    expect(cf.state).toBe("valued");
    expect(depthRowIdentityKey(judge)).toBe(depthRowIdentityKey(judgeCf));
  });

  it("filters rows by search query", () => {
    const row = mockRow({ playerName: "Aaron Judge" });
    expect(depthRowMatchesSearch(row, "RF", "NYY", "judge")).toBe(true);
    expect(depthRowMatchesSearch(row, "RF", "NYY", "soto")).toBe(false);
  });

  it("summarizes valued/catalog vs depth-only counts", () => {
    const summary = computeDepthChartMatchSummary(
      mockDepthChart({
        SP: [mockRow(), mockRow({ playerId: 200, playerName: "Other" })],
      }),
      "NYY",
      [mockPlayer()],
      null,
      null,
      new Map(),
    );
    expect(summary.totalRows).toBe(2);
    expect(summary.valuedCatalogMatches).toBe(1);
    expect(summary.depthOnly).toBe(1);
  });

  it("exact MLB ID match succeeds for 40-man catalog recovery targets", () => {
    const recoveryIds = [
      { id: 683011, name: "Anthony Volpe" },
      { id: 701542, name: "Will Warren" },
      { id: 669224, name: "Austin Wells" },
    ];
    const catalog = recoveryIds.map(({ id, name }) =>
      mockPlayer({
        id: String(id),
        mlbId: id,
        name,
        team: "NYY",
        valuation_eligible: id === 682987 ? false : true,
      }),
    );
    for (const { id, name } of recoveryIds) {
      const row = mockRow({ playerId: id, playerName: name });
      const match = resolveCatalogMatchForDepthRow(catalog, row, "NYY");
      expect(match.method).toBe("exact_mlb_id");
      expect(match.player?.mlbId).toBe(id);
    }
  });
});
