/**
 * Focused smoke tests for league creation validation and roster slot assignment.
 * Maps to manual smoke checklist steps 1–6.
 */
import { describe, expect, it } from "vitest";
import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";
import {
  assignTeamEntriesToRosterRows,
  countAssignedRosterRows,
  pickRosterSlotForNewEntry,
  teamHasOpenCompatibleSlot,
} from "../pages/command-center-utils/rosterAssignment";
import { validateLeaguePayload } from "./leaguePayload";
import { validateRosterSlotAssignment } from "./rosterSlot";

const smallOfLeague: League = {
  id: "l-smoke",
  name: "Smoke",
  commissionerId: "c1",
  memberIds: ["u1"],
  budget: 260,
  hitterBudgetPct: 0.65,
  teams: 2,
  scoringFormat: "roto",
  scoringCategories: [],
  rosterSlots: { OF: 2, UTIL: 1, BN: 1, C: 1 },
  draftStatus: "in-progress",
  isPublic: false,
  playerPool: "Mixed",
  teamNames: ["Alpha", "Beta"],
  posEligibilityThreshold: 5,
  seasonYear: 2026,
  leagueFamilyId: "fam",
  createdAt: "2026-01-01",
};

let seq = 0;
function rosterEntry(
  overrides: Partial<RosterEntry> & { acquiredAt: string },
): RosterEntry {
  seq += 1;
  return {
    _id: `e${seq}`,
    leagueId: "l-smoke",
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

describe("smoke: create league form validation", () => {
  const base = {
    name: "Smoke League",
    teams: 12,
    budget: 260,
    playerPool: "Mixed",
    scoringCategories: [{ name: "HR", type: "batting" as const }],
    rosterSlots: { OF: 3 },
  };

  it("step 1 — teams=1 blocked with expected message", () => {
    const result = validateLeaguePayload({ ...base, teams: 1 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fieldErrors.teams).toBe("League must have at least 2 teams");
      expect(result.message).toContain("League must have at least 2 teams");
    }
  });

  it("step 2 — teams=2 passes client validation", () => {
    expect(validateLeaguePayload({ ...base, teams: 2 }).valid).toBe(true);
  });
});

describe("smoke: draft assignment (OF → UTIL/BN)", () => {
  it("step 3 — 3rd OF goes to UTIL when OF full", () => {
    const roster = [
      rosterEntry({ acquiredAt: "2026-01-01T01:00:00Z", playerName: "OF1" }),
      rosterEntry({ acquiredAt: "2026-01-02T01:00:00Z", playerName: "OF2" }),
    ];
    expect(pickRosterSlotForNewEntry(smallOfLeague, "Alpha", ["OF"], roster)).toBe(
      "UTIL",
    );
  });

  it("step 3 — no duplicate row assignment in makeup grid", () => {
    const roster = [
      rosterEntry({ acquiredAt: "2026-01-01T01:00:00Z" }),
      rosterEntry({ acquiredAt: "2026-01-02T01:00:00Z" }),
      rosterEntry({ acquiredAt: "2026-01-03T01:00:00Z" }),
      rosterEntry({
        acquiredAt: "2026-01-04T01:00:00Z",
        rosterSlot: "UTIL",
        playerName: "OF4",
      }),
    ];
    const rows = assignTeamEntriesToRosterRows(smallOfLeague.rosterSlots, roster);
    const ids = rows
      .map((r) => r.entry?._id)
      .filter((id): id is string => id != null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("step 3 — log slot matches makeup when using auto-pick slot", () => {
    const roster = [
      rosterEntry({ acquiredAt: "2026-01-01T01:00:00Z", playerName: "A" }),
      rosterEntry({ acquiredAt: "2026-01-02T01:00:00Z", playerName: "B" }),
    ];
    const slot = pickRosterSlotForNewEntry(smallOfLeague, "Alpha", ["OF"], roster);
    const withPick = [
      ...roster,
      rosterEntry({
        acquiredAt: "2026-01-03T01:00:00Z",
        playerName: "C",
        rosterSlot: slot!,
      }),
    ];
    const rows = assignTeamEntriesToRosterRows(smallOfLeague.rosterSlots, withPick);
    const util = rows.find((r) => r.position === "UTIL");
    expect(util?.entry?.playerName).toBe("C");
    expect(util?.entry?.rosterSlot).toBe("UTIL");
  });
});

describe("smoke: illegal overflow assignment", () => {
  it("step 4 — UI path: no slot when roster full (OF league)", () => {
    const full = [
      rosterEntry({ acquiredAt: "2026-01-01T01:00:00Z", rosterSlot: "C", positions: ["C"] }),
      rosterEntry({ acquiredAt: "2026-01-02T01:00:00Z" }),
      rosterEntry({ acquiredAt: "2026-01-03T01:00:00Z" }),
      rosterEntry({
        acquiredAt: "2026-01-04T01:00:00Z",
        rosterSlot: "UTIL",
        playerName: "UTIL1",
      }),
      rosterEntry({
        acquiredAt: "2026-01-05T01:00:00Z",
        rosterSlot: "BN",
        playerName: "BN1",
      }),
    ];
    expect(pickRosterSlotForNewEntry(smallOfLeague, "Alpha", ["OF"], full)).toBeNull();
    expect(teamHasOpenCompatibleSlot(smallOfLeague, "Alpha", ["OF"], full)).toBe(
      false,
    );
  });
});

describe("smoke: draft log edit into full slot", () => {
  it("step 5 — validateRosterSlotAssignment rejects full OF slot", () => {
    const roster = [
      rosterEntry({ _id: "keep", acquiredAt: "2026-01-01T01:00:00Z" }),
      rosterEntry({ acquiredAt: "2026-01-02T01:00:00Z" }),
      rosterEntry({ acquiredAt: "2026-01-03T01:00:00Z" }),
    ];
    const result = validateRosterSlotAssignment(
      smallOfLeague,
      "Alpha",
      ["OF"],
      "OF",
      roster,
      "keep",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/full/i);
    }
  });
});

describe("smoke: overview filled count vs makeup", () => {
  it("step 6 — assigned filled equals entry count when slots stored legally", () => {
    const roster = [
      rosterEntry({ acquiredAt: "2026-01-01T01:00:00Z", rosterSlot: "C", positions: ["C"] }),
      rosterEntry({ acquiredAt: "2026-01-02T01:00:00Z", rosterSlot: "OF" }),
      rosterEntry({ acquiredAt: "2026-01-03T01:00:00Z", rosterSlot: "OF" }),
      rosterEntry({ acquiredAt: "2026-01-04T01:00:00Z", rosterSlot: "UTIL" }),
    ];
    const rows = assignTeamEntriesToRosterRows(smallOfLeague.rosterSlots, roster);
    expect(countAssignedRosterRows(rows)).toBe(roster.length);
    const makeupNames = rows
      .map((r) => r.entry?.playerName)
      .filter(Boolean)
      .sort();
    expect(makeupNames).toEqual(
      roster.map((e) => e.playerName).sort(),
    );
  });
});
