import { describe, it, expect } from "vitest";
import {
  diagnosisDepthChartMatching,
  formatDiagnosticsForConsole,
} from "./depthChartDiagnostics";
import type { DepthChartResponse } from "../api/players";
import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";

describe("depthChartDiagnostics", () => {
  const mockPlayer = (overrides?: Partial<Player>): Player => ({
    id: "mock-id",
    mlbId: 123456,
    name: "Aaron Judge",
    team: "NYY",
    position: "RF",
    age: 32,
    adp: 1.5,
    value: 85,
    tier: 1,
    headshot: "https://example.com/photo.jpg",
    stats: {},
    projection: {},
    outlook: "",
    ...overrides,
  });

  const mockRosterEntry = (overrides?: Partial<RosterEntry>): RosterEntry => ({
    _id: "roster-id",
    userId: "user-1",
    leagueId: "league-1",
    teamId: "team-1",
    playerName: "Juan Soto",
    playerTeam: "NYY",
    externalPlayerId: "765432",
    positions: ["LF"],
    price: 0,
    rosterSlot: "BN",
    isKeeper: false,
    acquiredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const mockDepthChart = (overrides?: Partial<DepthChartResponse>): DepthChartResponse => ({
    teamId: 147,
    generatedAt: new Date().toISOString(),
    season: 2026,
    rosterCount: 26,
    rosterLimit: 26,
    positions: {
      SP: [
        {
          rank: 1,
          playerId: 123456,
          playerName: "Aaron Judge",
          primaryPosition: "DH",
          status: "Active",
          usageStarts: 10,
          usageAppearances: 20,
          outOfPosition: false,
          needsManualReview: false,
          reasons: [],
        },
      ],
      C: [
        {
          rank: 1,
          playerId: 999999,
          playerName: "Austin Barnes",
          primaryPosition: "C",
          status: "Active",
          usageStarts: 5,
          usageAppearances: 15,
          outOfPosition: false,
          needsManualReview: false,
          reasons: [],
        },
      ],
      RP: [],
      "1B": [],
      "2B": [],
      "3B": [],
      SS: [],
      LF: [],
      CF: [],
      RF: [],
      DH: [],
    },
    manualReview: [],
    constraints: {
      rosterLimitRespected: true,
      note: "OK",
    },
    ...overrides,
  });

  describe("diagnosisDepthChartMatching", () => {
    it("should identify matched players by MLB ID", () => {
      const depth = mockDepthChart();
      const catalog = [mockPlayer({ mlbId: 123456 })];

      const diagnostics = diagnosisDepthChartMatching(depth, catalog, null, null);

      expect(diagnostics.summaryStats.matchedByMlbId).toBe(1);
      expect(diagnostics.summaryStats.unmatched).toBe(1);
    });

    it("should identify unmatched players", () => {
      const depth = mockDepthChart();
      const catalog: Player[] = [];

      const diagnostics = diagnosisDepthChartMatching(depth, catalog, null, null);

      expect(diagnostics.summaryStats.unmatched).toBe(2);
      expect(diagnostics.unmatchedDepthPlayers.length).toBe(2);
    });

    it("should identify player matched by name", () => {
      const depth = mockDepthChart();
      const catalog = [mockPlayer({ mlbId: 999, name: "Austin Barnes" })];

      const diagnostics = diagnosisDepthChartMatching(depth, catalog, null, null);

      expect(diagnostics.summaryStats.matchedByName).toBe(1);
    });

    it("should match players in roster by externalPlayerId", () => {
      const depth = mockDepthChart();
      const roster = [mockRosterEntry({ externalPlayerId: "999999" })];

      const diagnostics = diagnosisDepthChartMatching(depth, null, roster, null);

      expect(diagnostics.summaryStats.matchedByMlbId).toBe(1);
      expect(diagnostics.summaryStats.unmatched).toBe(1);
    });

    it("should provide detailed diagnostics for unmatched players", () => {
      const depth = mockDepthChart();

      const diagnostics = diagnosisDepthChartMatching(depth, null, null, null);

      const unmatchedPlayer = diagnostics.unmatchedDepthPlayers.find(
        (p) => p.depth.playerName === "Austin Barnes"
      );

      expect(unmatchedPlayer).toBeDefined();
      expect(unmatchedPlayer!.diagnostics.mlbIdUsed).toBe(999999);
      expect(unmatchedPlayer!.diagnostics.catalogHasMlbId).toBe(false);
      expect(unmatchedPlayer!.diagnostics.catalogHasName).toBe(false);
    });

    it("should handle name normalization for matching", () => {
      const depth = mockDepthChart();
      const catalog = [mockPlayer({ mlbId: 999, name: "  AUSTIN  BARNES  " })];

      const diagnostics = diagnosisDepthChartMatching(depth, catalog, null, null);

      expect(diagnostics.summaryStats.matchedByName).toBe(1);
    });

    it("should calculate unmatchedPercentage", () => {
      const depth = mockDepthChart();
      const catalog = [mockPlayer({ mlbId: 123456 })];

      const diagnostics = diagnosisDepthChartMatching(depth, catalog, null, null);

      const expectedPercentage = 50; // 1 unmatched out of 2
      expect(diagnostics.summaryStats.unmatchedPercentage).toBeCloseTo(expectedPercentage);
    });
  });

  describe("formatDiagnosticsForConsole", () => {
    it("should format diagnostics as readable string", () => {
      const depth = mockDepthChart();
      const diagnostics = diagnosisDepthChartMatching(depth, null, null, null);
      const formatted = formatDiagnosticsForConsole(diagnostics);

      expect(formatted).toContain("Depth Chart Matching Diagnostics");
      expect(formatted).toContain("Total depth players: 2");
      expect(formatted).toContain("UNMATCHED: 2");
      expect(formatted).toContain("Austin Barnes");
    });

    it("should include diagnostic details for unmatched players", () => {
      const depth = mockDepthChart();
      const diagnostics = diagnosisDepthChartMatching(depth, null, null, null);
      const formatted = formatDiagnosticsForConsole(diagnostics);

      expect(formatted).toContain("MLB ID: 999999");
      expect(formatted).toContain("Catalog has MLB ID? false");
    });
  });
});
