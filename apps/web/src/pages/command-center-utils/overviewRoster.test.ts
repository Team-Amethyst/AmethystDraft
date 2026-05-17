import { describe, it, expect } from "vitest";
import type { RosterEntry } from "../../api/roster";
import {
  buildOverviewTeamData,
  filterOverviewActiveRosterEntries,
  isOverviewActiveRosterEntry,
  isReserveRosterSlot,
} from "./overviewRoster";

/** Golden keeper counts from 2026 pre_draft fixture (Team A–I). */
const PRE_DRAFT_KEEPER_COUNTS: Record<string, number> = {
  "Team A": 7,
  "Team B": 11,
  "Team C": 9,
  "Team D": 7,
  "Team E": 8,
  "Team F": 9,
  "Team G": 8,
  "Team H": 7,
  "Team I": 10,
};

const ROSTER_SLOTS = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  MI: 1,
  OF: 4,
  SP: 5,
  RP: 2,
  UTIL: 1,
  BN: 3,
};

function entry(partial: Partial<RosterEntry> & { teamId: string }): RosterEntry {
  return {
    id: partial.id ?? `e-${partial.externalPlayerId ?? partial.playerName}`,
    leagueId: "l1",
    userId: "u1",
    externalPlayerId: partial.externalPlayerId ?? "1",
    playerName: partial.playerName ?? "Player",
    playerTeam: partial.playerTeam ?? "NYY",
    positions: partial.positions ?? ["OF"],
    price: partial.price ?? 1,
    rosterSlot: partial.rosterSlot ?? "OF",
    isKeeper: partial.isKeeper ?? false,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const KEEPER_SLOT_SEQUENCE = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "OF",
  "OF",
  "OF",
  "OF",
  "SP",
  "SP",
] as const;

function positionsForKeeperSlot(slot: string): string[] {
  if (slot === "MI") return ["2B", "SS"];
  if (slot === "UTIL") return ["OF", "1B"];
  return [slot];
}

function buildPreDraftTeamEntries(
  teamName: string,
  teamIndex: number,
): RosterEntry[] {
  const teamId = `team_${teamIndex + 1}`;
  const keeperCount = PRE_DRAFT_KEEPER_COUNTS[teamName] ?? 0;
  const rows: RosterEntry[] = [];
  for (let k = 0; k < keeperCount; k++) {
    const slot = KEEPER_SLOT_SEQUENCE[k % KEEPER_SLOT_SEQUENCE.length] ?? "UTIL";
    rows.push(
      entry({
        teamId,
        externalPlayerId: `${teamId}-k${k}`,
        playerName: `${teamName} Keeper ${k + 1}`,
        rosterSlot: slot,
        positions: positionsForKeeperSlot(slot),
        price: 5 + k,
        isKeeper: true,
      }),
    );
  }
  for (let m = 0; m < 8; m++) {
    rows.push(
      entry({
        teamId,
        externalPlayerId: `${teamId}-min${m}`,
        playerName: `${teamName} Minor ${m + 1}`,
        rosterSlot: "MIN",
        price: 0,
        isKeeper: false,
        positions: ["SS"],
      }),
    );
  }
  for (let t = 0; t < 8; t++) {
    rows.push(
      entry({
        teamId,
        externalPlayerId: `${teamId}-taxi${t}`,
        playerName: `${teamName} Taxi ${t + 1}`,
        rosterSlot: "TAXI",
        price: 0,
        isKeeper: false,
        positions: ["OF"],
      }),
    );
  }
  return rows;
}

describe("overviewRoster classification", () => {
  it("pre_draft active filled counts equal keeper counts only", () => {
    const teamNames = Object.keys(PRE_DRAFT_KEEPER_COUNTS);
    const allEntries = teamNames.flatMap((name, i) =>
      buildPreDraftTeamEntries(name, i),
    );

    for (const [teamName, wantKeepers] of Object.entries(PRE_DRAFT_KEEPER_COUNTS)) {
      const teamIndex = teamNames.indexOf(teamName);
      const card = buildOverviewTeamData(
        teamIndex,
        teamName,
        ROSTER_SLOTS,
        allEntries,
        260,
      );
      expect(card.rosterFilled).toBe(wantKeepers);
      expect(card.minors).toHaveLength(8);
      expect(card.taxi).toHaveLength(8);
    }
  });

  it("minors/taxi are excluded from active roster slot assignment", () => {
    const entries = buildPreDraftTeamEntries("Team A", 0);
    const active = filterOverviewActiveRosterEntries(entries);
    expect(active).toHaveLength(7);
    expect(active.every(isOverviewActiveRosterEntry)).toBe(true);
    expect(active.some((e) => isReserveRosterSlot(e.rosterSlot))).toBe(false);
  });

  it("MIN/TAXI rows do not appear in active slot cards", () => {
    const entries = buildPreDraftTeamEntries("Team A", 0);
    const card = buildOverviewTeamData(0, "Team A", ROSTER_SLOTS, entries, 260);
    const namesInSlots = card.slots
      .map((s) => s.playerName)
      .filter((n): n is string => n != null);
    expect(namesInSlots.every((n) => !n.includes("Minor"))).toBe(true);
    expect(namesInSlots.every((n) => !n.includes("Taxi"))).toBe(true);
    expect(card.slots.some((s) => s.price === 0)).toBe(false);
  });

  it("$0 reserve players do not affect active spend or filled count", () => {
    const entries = buildPreDraftTeamEntries("Team D", 3);
    const card = buildOverviewTeamData(3, "Team D", ROSTER_SLOTS, entries, 260);
    const activeSpend = filterOverviewActiveRosterEntries(entries).reduce(
      (s, e) => s + e.price,
      0,
    );
    expect(card.rosterFilled).toBe(7);
    expect(activeSpend).toBeGreaterThan(0);
    expect(card.budgetRemaining).toBe(260 - activeSpend);
  });

  it("after_10 active count = keepers + auction picks, excluding MIN/TAXI", () => {
    const entries: RosterEntry[] = [
      ...buildPreDraftTeamEntries("Team D", 3).filter(isOverviewActiveRosterEntry),
      entry({
        teamId: "team_4",
        externalPlayerId: "auction-1",
        playerName: "William Contreras",
        rosterSlot: "C",
        price: 25,
        isKeeper: false,
        positions: ["C"],
      }),
      entry({
        teamId: "team_4",
        externalPlayerId: "auction-2",
        playerName: "Mookie Betts",
        rosterSlot: "OF",
        price: 28,
        isKeeper: false,
        positions: ["OF"],
      }),
    ];
    const card = buildOverviewTeamData(3, "Team D", ROSTER_SLOTS, entries, 260);
    expect(card.rosterFilled).toBe(9);
    expect(card.minors).toHaveLength(0);
    expect(card.taxi).toHaveLength(0);
    expect(
      card.slots
        .filter((s) => s.playerName != null)
        .map((s) => s.playerName),
    ).toEqual(
      expect.arrayContaining([
        "William Contreras",
        "Mookie Betts",
        "Team D Keeper 1",
      ]),
    );
  });
});
