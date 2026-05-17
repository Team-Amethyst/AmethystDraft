import { describe, it, expect } from "vitest";
import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import { computeTeamData, isEngineAuctionBoardEntry } from "./roster";

function entry(partial: Partial<RosterEntry>): RosterEntry {
  return {
    id: "1",
    leagueId: "l1",
    userId: "u1",
    teamId: "team_1",
    externalPlayerId: "660001",
    playerName: "Player",
    playerTeam: "NYY",
    positions: ["OF"],
    price: 0,
    rosterSlot: "OF",
    isKeeper: false,
    createdAt: "",
    ...partial,
  };
}

const league = {
  id: "l1",
  name: "Test",
  teams: 1,
  budget: 260,
  rosterSlots: { OF: 1, UTIL: 1 },
  teamNames: ["Team A"],
  memberIds: ["u1"],
} as unknown as League;

describe("computeTeamData auction spend", () => {
  it("excludes minors/taxi $0 rows from spent", () => {
    const entries = [
      entry({ rosterSlot: "MIN", price: 0, externalPlayerId: "1" }),
      entry({ rosterSlot: "TAXI", price: 0, externalPlayerId: "2" }),
      entry({ rosterSlot: "OF", price: 25, externalPlayerId: "3" }),
    ];
    const team = computeTeamData(league, entries)[0];
    expect(team?.spent).toBe(25);
    expect(entries.filter(isEngineAuctionBoardEntry)).toHaveLength(1);
  });
});
