import type { RosterEntry } from "../../api/roster";
import { formatMlbTeamAbbrev } from "../../utils/mlbTeamAbbrev";
import {
  activeAuctionEntriesForTeam,
  filterActiveAuctionEntries,
  filterReserveEntries,
  isActiveAuctionEntry,
  isReserveEntry,
  isReserveRosterSlot,
} from "./roster";
import {
  assignTeamEntriesToRosterRows,
  countAssignedRosterRows,
  type AssignedRosterRow,
} from "./rosterAssignment";

export {
  isActiveAuctionEntry as isOverviewActiveRosterEntry,
  filterActiveAuctionEntries as filterOverviewActiveRosterEntries,
  isReserveRosterSlot,
  isReserveEntry,
};

export function isMinorsReserveEntry(entry: RosterEntry): boolean {
  return (entry.rosterSlot ?? "").toUpperCase().includes("MIN");
}

export function isTaxiReserveEntry(entry: RosterEntry): boolean {
  const slot = (entry.rosterSlot ?? "").toUpperCase();
  return slot.includes("TAXI") && !slot.includes("MIN");
}

export interface OverviewSlotRow {
  position: string;
  playerName: string | null;
  playerTeam: string | null;
  price: number | null;
  isKeeper: boolean;
}

export interface OverviewReserveRow {
  playerName: string;
  playerTeam: string | null;
  rosterSlot: string;
}

export interface OverviewTeamData {
  teamId: string;
  teamName: string;
  slots: OverviewSlotRow[];
  rosterFilled: number;
  rosterSlotCount: number;
  budgetRemaining: number;
  bidAvg: number;
  maxBid: number;
  minors: OverviewReserveRow[];
  taxi: OverviewReserveRow[];
}

export function assignedRowsToSlotRows(
  assigned: AssignedRosterRow[],
): OverviewSlotRow[] {
  return assigned.map((row) => ({
    position: row.position,
    playerName: row.entry?.playerName ?? null,
    playerTeam: formatMlbTeamAbbrev(row.entry?.playerTeam) ?? null,
    price: row.entry?.price ?? null,
    isKeeper: row.entry?.isKeeper ?? false,
  }));
}

export function buildOverviewTeamData(
  teamIndex: number,
  teamName: string,
  rosterSlots: Record<string, number>,
  entries: readonly RosterEntry[],
  budget: number,
): OverviewTeamData {
  const teamId = `team_${teamIndex + 1}`;
  const teamEntries = entries.filter((e) => e.teamId === teamId);
  const activeEntries = activeAuctionEntriesForTeam(entries, teamId);
  const assigned = assignTeamEntriesToRosterRows(rosterSlots, activeEntries);
  const slots = assignedRowsToSlotRows(assigned);

  const rosterFilled = countAssignedRosterRows(assigned);
  const rosterSlotCount = slots.length;

  const totalSpent = activeEntries.reduce((sum, e) => sum + e.price, 0);
  const remaining = budget - totalSpent;
  const open = rosterSlotCount - rosterFilled;

  const toReserve = (e: RosterEntry): OverviewReserveRow => ({
    playerName: e.playerName,
    playerTeam: formatMlbTeamAbbrev(e.playerTeam),
    rosterSlot: e.rosterSlot,
  });

  return {
    teamId,
    teamName,
    slots,
    rosterFilled,
    rosterSlotCount,
    budgetRemaining: remaining,
    bidAvg: open > 0 ? Math.round(remaining / open) : 0,
    maxBid: open > 0 ? remaining - (open - 1) : 0,
    minors: filterReserveEntries(teamEntries)
      .filter(isMinorsReserveEntry)
      .map(toReserve),
    taxi: filterReserveEntries(teamEntries)
      .filter(isTaxiReserveEntry)
      .map(toReserve),
  };
}
