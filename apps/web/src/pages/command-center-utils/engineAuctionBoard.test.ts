import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../../api/roster";
import { isEngineAuctionBoardEntry } from "./roster";

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    _id: "id",
    leagueId: "l",
    userId: "u",
    teamId: "team_1",
    externalPlayerId: "p1",
    playerName: "P",
    playerTeam: "T",
    positions: ["SP"],
    price: 1,
    rosterSlot: "SP",
    isKeeper: false,
    acquiredAt: "2026-01-01",
    createdAt: "2026-01-01",
    ...overrides,
  };
}

describe("isEngineAuctionBoardEntry", () => {
  it("excludes keepers", () => {
    expect(isEngineAuctionBoardEntry(entry({ isKeeper: true }))).toBe(false);
  });

  it("excludes minors and taxi slots", () => {
    expect(isEngineAuctionBoardEntry(entry({ rosterSlot: "MIN" }))).toBe(false);
    expect(isEngineAuctionBoardEntry(entry({ rosterSlot: "TAXI" }))).toBe(
      false,
    );
  });

  it("includes normal auction picks", () => {
    expect(isEngineAuctionBoardEntry(entry({ rosterSlot: "SP" }))).toBe(true);
  });
});
