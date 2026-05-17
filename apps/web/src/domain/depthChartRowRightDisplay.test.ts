import { describe, expect, it, vi } from "vitest";
import type { DepthChartPlayerRow } from "../api/players";
import type { Player } from "../types/player";
import {
  formatDepthChartCompactMatchLine,
  formatDepthChartHeaderUpdatedLabel,
  formatDepthChartMatchSummaryLine,
  resolveDepthRowMatch,
  resolveDepthRowRightDisplay,
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

describe("resolveDepthRowRightDisplay", () => {
  it("renders auction value instead of Valued for valued players", () => {
    const resolution = resolveDepthRowMatch(
      mockRow(),
      "SP",
      "NYY",
      [mockPlayer()],
      [],
      [],
      new Map([["p-100", { auction_value: 5 }]]),
    );
    const display = resolveDepthRowRightDisplay(
      resolution,
      mockRow(),
      new Map([["p-100", { auction_value: 5 }]]),
    );
    expect(display).toEqual({ kind: "auction", formattedValue: "$5" });
  });

  it("renders rostered state with winning team and price paid", () => {
    const row = mockRow();
    const resolution = resolveDepthRowMatch(
      row,
      "SP",
      "NYY",
      [mockPlayer()],
      [
        {
          _id: "r1",
          userId: "u",
          leagueId: "l",
          teamId: "team_2",
          externalPlayerId: "100",
          playerName: "Test Player",
          playerTeam: "NYY",
          positions: ["SP"],
          price: 34,
          rosterSlot: "SP",
          isKeeper: false,
          acquiredAt: "",
          createdAt: "",
        },
      ],
      [],
      new Map([["p-100", { auction_value: 99 }]]),
    );
    const display = resolveDepthRowRightDisplay(
      resolution,
      row,
      new Map([["p-100", { auction_value: 99 }]]),
      [
        {
          _id: "r1",
          userId: "u",
          leagueId: "l",
          teamId: "team_2",
          externalPlayerId: "100",
          playerName: "Test Player",
          playerTeam: "NYY",
          positions: ["SP"],
          price: 34,
          rosterSlot: "SP",
          isKeeper: false,
          acquiredAt: "",
          createdAt: "",
        },
      ],
      ["Team A", "Bravo Squad"],
    );
    expect(display).toEqual({
      kind: "rostered_won",
      teamName: "Bravo Squad",
      formattedPrice: "$34",
    });
  });

  it("renders dash for catalog-only players without auction", () => {
    const resolution = resolveDepthRowMatch(
      mockRow({ playerName: "Spencer Jones", playerId: 682987 }),
      "RF",
      "NYY",
      [mockPlayer({ id: "jones", mlbId: 682987, name: "Spencer Jones" })],
      [],
      [],
      new Map(),
    );
    const display = resolveDepthRowRightDisplay(
      resolution,
      mockRow({ playerName: "Spencer Jones", playerId: 682987 }),
      new Map(),
    );
    expect(display).toEqual({ kind: "dash" });
  });

  it("renders Depth only when no catalog match", () => {
    const row = mockRow({ playerId: 999 });
    const resolution = resolveDepthRowMatch(
      row,
      "SP",
      "NYY",
      [],
      [],
      [],
      new Map(),
    );
    const display = resolveDepthRowRightDisplay(resolution, row, new Map());
    expect(display?.kind).toBe("status");
    if (display?.kind === "status") {
      expect(display.label).toBe("Depth only");
    }
  });

  it("renders Unmatched for missing identity", () => {
    const row = mockRow({ playerId: 0, playerName: "  " });
    const resolution = resolveDepthRowMatch(
      row,
      "SP",
      "NYY",
      [],
      [],
      [],
      new Map(),
    );
    const display = resolveDepthRowRightDisplay(resolution, row, new Map());
    expect(display?.kind).toBe("status");
    if (display?.kind === "status") {
      expect(display.label).toBe("Unmatched");
    }
  });
});

describe("formatDepthChartHeaderUpdatedLabel", () => {
  it("formats short clock time", () => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("2:57 PM");
    expect(formatDepthChartHeaderUpdatedLabel("2026-05-17T18:57:20.000Z")).toBe(
      "2:57 PM",
    );
  });
});

describe("formatDepthChartCompactMatchLine", () => {
  it("orders valued, catalog-only, rostered, depth-only", () => {
    expect(
      formatDepthChartCompactMatchLine(
        {
          totalRows: 32,
          valuedCatalogMatches: 32,
          depthOnly: 0,
          unmatched: 0,
          rostered: 3,
          valued: 23,
          catalogOnly: 6,
        },
        { useValuationBreakdown: true },
      ),
    ).toBe("23 valued · 6 catalog-only · 3 rostered · 0 depth-only");
  });
});

describe("formatDepthChartMatchSummaryLine", () => {
  it("uses valued/catalog-only breakdown when valuation board is present", () => {
    const line = formatDepthChartMatchSummaryLine(
      {
        totalRows: 32,
        valuedCatalogMatches: 32,
        depthOnly: 0,
        unmatched: 0,
        rostered: 1,
        valued: 27,
        catalogOnly: 5,
      },
      { useValuationBreakdown: true },
    );
    expect(line).toBe(
      "32 assignments · 27 valued · 5 catalog-only · 0 depth-only · 1 rostered",
    );
  });
});
