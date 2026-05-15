import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";
import { validateRosterSlotAssignment } from "./rosterSlot";

const league: Pick<League, "rosterSlots" | "teamNames"> = {
  rosterSlots: { OF: 2, UTIL: 1 },
  teamNames: ["Alpha"],
};

function entry(overrides: Partial<RosterEntry>): RosterEntry {
  return {
    _id: "e1",
    leagueId: "l1",
    userId: "u1",
    teamId: "team_1",
    externalPlayerId: "p1",
    playerName: "Player",
    playerTeam: "T",
    positions: ["OF"],
    price: 1,
    rosterSlot: "OF",
    isKeeper: false,
    acquiredAt: "2026-01-01",
    createdAt: "2026-01-01",
    ...overrides,
  };
}

describe("validateRosterSlotAssignment", () => {
  it("rejects a 3rd OF when two OF slots are full", () => {
    const roster = [
      entry({ _id: "a", rosterSlot: "OF" }),
      entry({ _id: "b", rosterSlot: "OF" }),
    ];
    const result = validateRosterSlotAssignment(
      league,
      "Alpha",
      ["OF"],
      "OF",
      roster,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/full/i);
    }
  });

  it("allows UTIL when OF slots are full", () => {
    const roster = [
      entry({ _id: "a", rosterSlot: "OF" }),
      entry({ _id: "b", rosterSlot: "OF" }),
    ];
    const result = validateRosterSlotAssignment(
      league,
      "Alpha",
      ["OF"],
      "UTIL",
      roster,
    );
    expect(result.ok).toBe(true);
  });
});
