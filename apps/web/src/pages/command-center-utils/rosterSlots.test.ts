import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import { availableSlotsForTeamName } from "./roster";

const leagueBase: League = {
  id: "l1",
  name: "L",
  commissionerId: "c1",
  memberIds: ["u1"],
  budget: 260,
  hitterBudgetPct: 0.65,
  teams: 2,
  scoringFormat: "roto",
  scoringCategories: [],
  rosterSlots: { SP: 2, C: 1, BN: 2 },
  draftStatus: "in-progress",
  isPublic: false,
  playerPool: "Mixed",
  teamNames: ["Alpha", "Beta"],
  posEligibilityThreshold: 5,
  createdAt: "2026-01-01",
};

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    _id: Math.random().toString(36).slice(2),
    leagueId: "l1",
    userId: "u1",
    teamId: "team_1",
    externalPlayerId: "x",
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

describe("availableSlotsForTeamName", () => {
  it("returns all slots when league is null", () => {
    const slots = ["SP", "C"];
    expect(availableSlotsForTeamName(null, "Alpha", slots, [])).toEqual(
      new Set(slots),
    );
  });

  it("excludes filled positions up to roster cap", () => {
    const roster = [
      entry({ rosterSlot: "SP" }),
      entry({ rosterSlot: "SP" }),
    ];
    const open = availableSlotsForTeamName(
      leagueBase,
      "Alpha",
      ["SP", "C", "BN"],
      roster,
    );
    expect(open.has("SP")).toBe(false);
    expect(open.has("C")).toBe(true);
    expect(open.has("BN")).toBe(true);
  });
});
