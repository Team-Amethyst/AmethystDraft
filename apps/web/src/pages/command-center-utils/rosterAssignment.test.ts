import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import {
  assignTeamEntriesToRosterRows,
  countAssignedRosterRows,
  pickRosterSlotForNewEntry,
  teamHasOpenCompatibleSlot,
} from "./rosterAssignment";

const league: League = {
  id: "l1",
  name: "Test",
  commissionerId: "c1",
  memberIds: ["u1"],
  budget: 260,
  hitterBudgetPct: 0.65,
  teams: 1,
  scoringFormat: "roto",
  scoringCategories: [],
  rosterSlots: { C: 1, OF: 3, UTIL: 1, BN: 2 },
  draftStatus: "in-progress",
  isPublic: false,
  playerPool: "Mixed",
  teamNames: ["Alpha"],
  posEligibilityThreshold: 5,
  seasonYear: 2026,
  leagueFamilyId: "fam-l1",
  createdAt: "2026-01-01",
};

let seq = 0;
function entry(
  overrides: Partial<RosterEntry> & { acquiredAt: string },
): RosterEntry {
  seq += 1;
  return {
    _id: `e${seq}`,
    leagueId: "l1",
    userId: "u1",
    teamId: "team_1",
    externalPlayerId: `p${seq}`,
    playerName: overrides.playerName ?? `Player ${seq}`,
    playerTeam: "T",
    positions: ["OF"],
    price: 1,
    rosterSlot: "OF",
    isKeeper: false,
    createdAt: overrides.acquiredAt,
    ...overrides,
  };
}

describe("pickRosterSlotForNewEntry", () => {
  it("fills OF slots before UTIL when OF are full", () => {
    const roster = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z", playerName: "OF1" }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z", playerName: "OF2" }),
      entry({ acquiredAt: "2026-01-03T01:00:00Z", playerName: "OF3" }),
    ];
    expect(pickRosterSlotForNewEntry(league, "Alpha", ["OF"], roster)).toBe(
      "UTIL",
    );
  });

  it("fills BN after OF and UTIL are full", () => {
    const roster = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-03T01:00:00Z" }),
      entry({
        acquiredAt: "2026-01-04T01:00:00Z",
        rosterSlot: "UTIL",
        playerName: "UTIL1",
      }),
    ];
    expect(pickRosterSlotForNewEntry(league, "Alpha", ["OF"], roster)).toBe(
      "BN",
    );
  });

  it("returns null when no compatible slot remains", () => {
    const full: RosterEntry[] = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z", rosterSlot: "C", positions: ["C"] }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-03T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-04T01:00:00Z" }),
      entry({
        acquiredAt: "2026-01-05T01:00:00Z",
        rosterSlot: "UTIL",
        playerName: "UTIL1",
      }),
      entry({ acquiredAt: "2026-01-06T01:00:00Z", rosterSlot: "BN", playerName: "BN1" }),
      entry({ acquiredAt: "2026-01-07T01:00:00Z", rosterSlot: "BN", playerName: "BN2" }),
    ];
    expect(pickRosterSlotForNewEntry(league, "Alpha", ["OF"], full)).toBeNull();
    expect(teamHasOpenCompatibleSlot(league, "Alpha", ["OF"], full)).toBe(
      false,
    );
  });
});

describe("assignTeamEntriesToRosterRows", () => {
  it("shows 4th OF in UTIL when all OF slots have OF players stored as OF", () => {
    const roster = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z", playerName: "A" }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z", playerName: "B" }),
      entry({ acquiredAt: "2026-01-03T01:00:00Z", playerName: "C" }),
      entry({ acquiredAt: "2026-01-04T01:00:00Z", playerName: "D" }),
    ];
    const rows = assignTeamEntriesToRosterRows(league.rosterSlots, roster);
    const ofRows = rows.filter((r) => r.position === "OF");
    const utilRow = rows.find((r) => r.position === "UTIL");

    expect(ofRows.every((r) => r.entry != null)).toBe(true);
    expect(ofRows.map((r) => r.entry?.playerName)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(utilRow?.entry?.playerName).toBe("D");
  });

  it("does not assign two players to the same roster row", () => {
    const roster = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z" }),
    ];
    const rows = assignTeamEntriesToRosterRows(league.rosterSlots, roster);
    const ids = rows
      .map((r) => r.entry?._id)
      .filter((id): id is string => id != null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filled count matches assigned legal entries", () => {
    const roster = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-03T01:00:00Z" }),
      entry({ acquiredAt: "2026-01-04T01:00:00Z" }),
    ];
    const rows = assignTeamEntriesToRosterRows(league.rosterSlots, roster);
    expect(countAssignedRosterRows(rows)).toBe(4);
    expect(rows.filter((r) => r.entry).length).toBe(4);
  });

  it("agrees with stored slot after pickRosterSlotForNewEntry logs 4th OF to UTIL", () => {
    const roster = [
      entry({ acquiredAt: "2026-01-01T01:00:00Z", playerName: "A" }),
      entry({ acquiredAt: "2026-01-02T01:00:00Z", playerName: "B" }),
      entry({ acquiredAt: "2026-01-03T01:00:00Z", playerName: "C" }),
    ];
    const slotToSave = pickRosterSlotForNewEntry(league, "Alpha", ["OF"], roster);
    expect(slotToSave).toBe("UTIL");

    const withFourth = [
      ...roster,
      entry({
        acquiredAt: "2026-01-04T01:00:00Z",
        playerName: "D",
        rosterSlot: slotToSave!,
      }),
    ];
    const rows = assignTeamEntriesToRosterRows(league.rosterSlots, withFourth);
    const utilRow = rows.find((r) => r.position === "UTIL");
    expect(utilRow?.entry?.playerName).toBe("D");
    expect(utilRow?.entry?.rosterSlot).toBe("UTIL");
  });
});
