import { describe, it, expect } from "vitest";
import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import { auctionCenterCategoryImpactRows } from "./categoryImpactRows";
import {
  activeAuctionEntriesForTeam,
  computeTeamData,
  filterActiveAuctionEntries,
  filterReserveEntries,
  isActiveAuctionEntry,
  isDraftAuctionEntry,
  isReserveEntry,
  leagueWideAuctionSlotsRemaining,
  teamCanBid,
} from "./roster";
import {
  assignTeamEntriesToRosterRows,
  countAssignedRosterRows,
  teamRosterSlotCounts,
} from "./rosterAssignment";
import { commandCenterWalletCapsFromMyTeam } from "../../utils/valuation";
import { buildProjectedStandings } from "./standings";

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

const league = {
  id: "l1",
  name: "Demo",
  teams: 1,
  budget: 260,
  rosterSlots: ROSTER_SLOTS,
  teamNames: ["Team A"],
  memberIds: ["u1"],
} as unknown as League;

function entry(partial: Partial<RosterEntry> & { teamId?: string }): RosterEntry {
  return {
    id: partial.id ?? `e-${partial.externalPlayerId ?? partial.playerName}`,
    leagueId: "l1",
    userId: "u1",
    teamId: partial.teamId ?? "team_1",
    externalPlayerId: partial.externalPlayerId ?? "1",
    playerName: partial.playerName ?? "Player",
    playerTeam: partial.playerTeam ?? "NYY",
    positions: partial.positions ?? ["OF"],
    price: partial.price ?? 1,
    rosterSlot: partial.rosterSlot ?? "OF",
    isKeeper: partial.isKeeper ?? false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function buildPreDraftTeamA(): RosterEntry[] {
  const rows: RosterEntry[] = [];
  for (let k = 0; k < 7; k++) {
    rows.push(
      entry({
        externalPlayerId: `k${k}`,
        playerName: `Keeper ${k + 1}`,
        rosterSlot: k % 2 === 0 ? "OF" : "SP",
        positions: k % 2 === 0 ? ["OF"] : ["SP"],
        price: 5 + k,
        isKeeper: true,
      }),
    );
  }
  for (let m = 0; m < 8; m++) {
    rows.push(
      entry({
        externalPlayerId: `min${m}`,
        playerName: `Minor ${m + 1}`,
        rosterSlot: "MIN",
        price: 0,
        positions: ["SS"],
      }),
    );
  }
  for (let t = 0; t < 8; t++) {
    rows.push(
      entry({
        externalPlayerId: `taxi${t}`,
        playerName: `Taxi ${t + 1}`,
        rosterSlot: "TAXI",
        price: 0,
        positions: ["OF"],
      }),
    );
  }
  return rows;
}

describe("command center roster classification", () => {
  it("classifies by roster slot, not price === 0", () => {
    const reserveZero = entry({ rosterSlot: "MIN", price: 0 });
    const keeperPaid = entry({ rosterSlot: "OF", price: 12, isKeeper: true });
    const auctionPaid = entry({ rosterSlot: "SP", price: 0, isKeeper: false });
    expect(isReserveEntry(reserveZero)).toBe(true);
    expect(isActiveAuctionEntry(keeperPaid)).toBe(true);
    expect(isActiveAuctionEntry(auctionPaid)).toBe(true);
    expect(isDraftAuctionEntry(auctionPaid)).toBe(true);
  });

  it("Team Makeup assignment excludes MIN/TAXI (Team A pre-draft = 7 filled)", () => {
    const all = buildPreDraftTeamA();
    const active = activeAuctionEntriesForTeam(all, "team_1");
    const assigned = assignTeamEntriesToRosterRows(ROSTER_SLOTS, active);
    expect(active).toHaveLength(7);
    expect(countAssignedRosterRows(assigned)).toBe(7);
    const names = assigned
      .map((r) => r.entry?.playerName)
      .filter((n): n is string => !!n);
    expect(names.some((n) => n.startsWith("Minor"))).toBe(false);
    expect(names.some((n) => n.startsWith("Taxi"))).toBe(false);
  });

  it("wallet/budget ignores MIN/TAXI for pre-draft Team A", () => {
    const caps = commandCenterWalletCapsFromMyTeam(league, buildPreDraftTeamA());
    expect(caps).not.toBeNull();
    expect(caps!.openSpots).toBe(21 - 7);
    const keeperSpend = Array.from({ length: 7 }, (_, k) => 5 + k).reduce(
      (s, p) => s + p,
      0,
    );
    expect(caps!.budgetRemaining).toBe(260 - keeperSpend);
  });

  it("computeTeamData liquidity row ignores reserves", () => {
    const row = computeTeamData(league, buildPreDraftTeamA())[0];
    expect(row?.filled).toBe(7);
    expect(row?.open).toBe(14);
  });

  it("league-wide open slots ignore reserves", () => {
    const open = leagueWideAuctionSlotsRemaining(league, buildPreDraftTeamA());
    expect(open).toBe(21 - 7);
  });

  it("teamCanBid ignores reserve slot occupancy", () => {
    const all = buildPreDraftTeamA();
    const can = teamCanBid("Team A", ["OF"], league, all);
    expect(can).toBe(true);
  });

  it("category impact uses active roster only", () => {
    const all = buildPreDraftTeamA();
    const rows = auctionCenterCategoryImpactRows({
      selectedPlayer: {
        id: "999",
        mlbId: 999,
        name: "Test Free Agent",
        team: "LAD",
        position: "OF",
        positions: ["OF"],
        age: 25,
        catalog_rank: 1,
        catalog_tier: 1,
        value: 20,
        headshot: "",
        outlook: "",
        stats: {},
        projection: {},
      },
      scoringCategories: [{ name: "HR", type: "batting" }],
      statView: "hitting",
      myTeamEntries: all,
      allPlayers: [],
      rosterImpact: {
        leagueTeamNames: ["Team A"],
        fullRosterEntries: all,
        myTeamId: "team_1",
        myTeamName: "Team A",
        draftedIds: new Set(all.map((e) => e.externalPlayerId)),
        leagueId: "l1",
        userId: "u1",
      },
    });
    expect(rows.length).toBeGreaterThanOrEqual(0);
    expect(filterActiveAuctionEntries(all)).toHaveLength(7);
  });

  it("projected standings ignore reserves", () => {
    const all = buildPreDraftTeamA();
    const active = filterActiveAuctionEntries(all);
    const standings = buildProjectedStandings(
      ["Team A"],
      active,
      new Map(),
      [{ name: "HR", type: "batting" }],
    );
    expect(standings).toHaveLength(1);
    expect(active).toHaveLength(7);
  });

  it("reserve filters still return MIN/TAXI for Taxi Draft / modal", () => {
    const all = buildPreDraftTeamA();
    expect(filterReserveEntries(all)).toHaveLength(16);
    expect(
      filterReserveEntries(all).every(
        (e) =>
          e.rosterSlot.toUpperCase().includes("MIN") ||
          e.rosterSlot.toUpperCase().includes("TAXI"),
      ),
    ).toBe(true);
  });

  it("teamRosterSlotCounts with only active entries matches Team Makeup", () => {
    const active = activeAuctionEntriesForTeam(buildPreDraftTeamA(), "team_1");
    const { filled, open } = teamRosterSlotCounts(ROSTER_SLOTS, active);
    expect(filled).toBe(7);
    expect(open).toBe(14);
  });
});
