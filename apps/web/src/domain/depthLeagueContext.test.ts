import { describe, it, expect } from "vitest";
import {
  buildDepthLeagueRelevanceLookup,
  isDepthChartRowLeagueRelevant,
} from "./depthLeagueContext";
import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";
import type { DepthChartPlayerRow } from "../api/players";

describe("depthLeagueContext", () => {
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
    ...overrides,
  });

  const mockRosterEntry = (overrides?: Partial<RosterEntry>): RosterEntry => ({
    id: "roster-id",
    userId: "user-1",
    leagueId: "league-1",
    playerName: "Juan Soto",
    externalPlayerId: 765432,
    position: "LF",
    ...overrides,
  });

  const mockWatchlistPlayer = (overrides?: Partial<WatchlistPlayer>): WatchlistPlayer => ({
    mlbId: 111111,
    name: "Shohei Ohtani",
    ...overrides,
  });

  const mockDepthRow = (overrides?: Partial<DepthChartPlayerRow>): DepthChartPlayerRow => ({
    rank: 1,
    playerId: 999999,
    playerName: "Test Player",
    primaryPosition: "C",
    status: "Active",
    usageStarts: 10,
    usageAppearances: 20,
    outOfPosition: false,
    needsManualReview: false,
    reasons: [],
    ...overrides,
  });

  describe("buildDepthLeagueRelevanceLookup", () => {
    it("should build lookup from catalog players by mlbId", () => {
      const catalog = [mockPlayer({ mlbId: 123456 })];
      const lookup = buildDepthLeagueRelevanceLookup(catalog, null, null);

      expect(lookup.mlbPlayerIds.has(123456)).toBe(true);
    });

    it("should build lookup from catalog players by normalized name", () => {
      const catalog = [mockPlayer({ name: "Aaron Judge" })];
      const lookup = buildDepthLeagueRelevanceLookup(catalog, null, null);

      expect(lookup.normalizedNames.has("aaron judge")).toBe(true);
    });

    it("should build lookup from roster entries by externalPlayerId", () => {
      const roster = [mockRosterEntry({ externalPlayerId: 765432 })];
      const lookup = buildDepthLeagueRelevanceLookup(null, roster, null);

      expect(lookup.mlbPlayerIds.has(765432)).toBe(true);
    });

    it("should build lookup from roster entries by playerName", () => {
      const roster = [mockRosterEntry({ playerName: "Juan Soto" })];
      const lookup = buildDepthLeagueRelevanceLookup(null, roster, null);

      expect(lookup.normalizedNames.has("juan soto")).toBe(true);
    });

    it("should build lookup from watchlist players by mlbId", () => {
      const watchlist = [mockWatchlistPlayer({ mlbId: 111111 })];
      const lookup = buildDepthLeagueRelevanceLookup(null, null, watchlist);

      expect(lookup.mlbPlayerIds.has(111111)).toBe(true);
    });

    it("should build lookup from watchlist players by name", () => {
      const watchlist = [mockWatchlistPlayer({ name: "Shohei Ohtani" })];
      const lookup = buildDepthLeagueRelevanceLookup(null, null, watchlist);

      expect(lookup.normalizedNames.has("shohei ohtani")).toBe(true);
    });

    it("should combine data from all three sources", () => {
      const catalog = [mockPlayer({ mlbId: 111 })];
      const roster = [mockRosterEntry({ externalPlayerId: 222 })];
      const watchlist = [mockWatchlistPlayer({ mlbId: 333 })];

      const lookup = buildDepthLeagueRelevanceLookup(catalog, roster, watchlist);

      expect(lookup.mlbPlayerIds.has(111)).toBe(true);
      expect(lookup.mlbPlayerIds.has(222)).toBe(true);
      expect(lookup.mlbPlayerIds.has(333)).toBe(true);
    });

    it("should handle null/undefined inputs gracefully", () => {
      const lookup = buildDepthLeagueRelevanceLookup(null, null, null);
      expect(lookup.mlbPlayerIds.size).toBe(0);
      expect(lookup.normalizedNames.size).toBe(0);
    });
  });

  describe("isDepthChartRowLeagueRelevant", () => {
    it("should match depth row by mlbId (primary method)", () => {
      const lookup = buildDepthLeagueRelevanceLookup(
        [mockPlayer({ mlbId: 123456 })],
        null,
        null
      );
      const row = mockDepthRow({ playerId: 123456, playerName: "Aaron Judge" });

      expect(isDepthChartRowLeagueRelevant(row, lookup)).toBe(true);
    });

    it("should match depth row by normalized name (fallback)", () => {
      const lookup = buildDepthLeagueRelevanceLookup(
        [mockPlayer({ mlbId: 999, name: "Aaron Judge" })],
        null,
        null
      );
      const row = mockDepthRow({ playerId: 123456, playerName: "Aaron Judge" });

      expect(isDepthChartRowLeagueRelevant(row, lookup)).toBe(true);
    });

    it("should handle name normalization (case-insensitive, extra spaces)", () => {
      const lookup = buildDepthLeagueRelevanceLookup(
        [mockPlayer({ mlbId: 999, name: "Aaron  Judge" })],
        null,
        null
      );
      const row = mockDepthRow({
        playerId: 123456,
        playerName: "AARON JUDGE",
      });

      expect(isDepthChartRowLeagueRelevant(row, lookup)).toBe(true);
    });

    it("should return false when player is not in league context", () => {
      const lookup = buildDepthLeagueRelevanceLookup(
        [mockPlayer({ mlbId: 111111, name: "Aaron Judge" })],
        null,
        null
      );
      const row = mockDepthRow({
        playerId: 999999,
        playerName: "Unknown Player",
      });

      expect(isDepthChartRowLeagueRelevant(row, lookup)).toBe(false);
    });

    it("should prioritize mlbId over name (no false name-based matches)", () => {
      const lookup = buildDepthLeagueRelevanceLookup(
        [mockPlayer({ mlbId: 111, name: "Player A" })],
        null,
        null
      );
      // Row has different mlbId but same name as someone else (not in lookup)
      const row = mockDepthRow({
        playerId: 222,
        playerName: "Some Other Player",
      });

      expect(isDepthChartRowLeagueRelevant(row, lookup)).toBe(false);
    });

    it("should work with empty lookup", () => {
      const lookup = buildDepthLeagueRelevanceLookup(null, null, null);
      const row = mockDepthRow();

      expect(isDepthChartRowLeagueRelevant(row, lookup)).toBe(false);
    });
  });
});
