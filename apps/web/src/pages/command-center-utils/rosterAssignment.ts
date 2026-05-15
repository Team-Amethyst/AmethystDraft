import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import {
  getEligibleSlotsForPositions,
  normalizePlayerPositions,
  slotAllowsPosition,
} from "../../utils/eligibility";
import { availableSlotsForTeamName } from "./roster";

/** Prefer filling specific positions before UTIL / bench. */
export const ROSTER_SLOT_PICK_ORDER = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "CI",
  "OF",
  "SP",
  "RP",
  "P",
  "UTIL",
  "BN",
] as const;

export interface AssignedRosterRow {
  position: string;
  entry: RosterEntry | null;
}

function orderedSlotKeys(rosterSlots: Record<string, number>): string[] {
  const keys = Object.keys(rosterSlots);
  const preferred = ROSTER_SLOT_PICK_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !ROSTER_SLOT_PICK_ORDER.includes(k as (typeof ROSTER_SLOT_PICK_ORDER)[number]));
  return [...preferred, ...rest];
}

function sortOpenEligibleSlots(
  eligible: string[],
  available: Set<string>,
): string[] {
  const open = eligible.filter((s) => available.has(s));
  const ordered = ROSTER_SLOT_PICK_ORDER.filter((s) => open.includes(s));
  const orderedSet = new Set<string>(ordered);
  const extras = open.filter((s) => !orderedSet.has(s));
  return [...ordered, ...extras];
}

/** First open roster slot for a new pick (OF before UTIL before BN when eligible). */
export function pickRosterSlotForNewEntry(
  league: League,
  teamName: string,
  positions: string[],
  roster: RosterEntry[],
): string | null {
  const allSlots = Object.keys(league.rosterSlots);
  const eligible = getEligibleSlotsForPositions(positions, allSlots);
  const available = availableSlotsForTeamName(
    league,
    teamName,
    allSlots,
    roster,
  );
  return sortOpenEligibleSlots(eligible, available)[0] ?? null;
}

export function teamHasOpenCompatibleSlot(
  league: League,
  teamName: string,
  positions: string[],
  roster: RosterEntry[],
): boolean {
  return pickRosterSlotForNewEntry(league, teamName, positions, roster) != null;
}

/**
 * Assign team entries to roster rows for display (acquisition order).
 * Uses eligibility + capacity — not only stored `rosterSlot` — so overflow
 * OF picks still appear in UTIL/BN when OF slots are full.
 */
export function assignTeamEntriesToRosterRows(
  rosterSlots: Record<string, number>,
  teamEntries: RosterEntry[],
): AssignedRosterRow[] {
  const rows: AssignedRosterRow[] = [];
  for (const pos of orderedSlotKeys(rosterSlots)) {
    const count = rosterSlots[pos] ?? 0;
    for (let i = 0; i < count; i++) {
      rows.push({ position: pos, entry: null });
    }
  }

  const sorted = [...teamEntries].sort(
    (a, b) =>
      new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
      new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
  );

  for (const entry of sorted) {
    const positions = normalizePlayerPositions(entry.positions);
    if (positions.length === 0) continue;
    for (const row of rows) {
      if (row.entry) continue;
      if (!positions.some((p) => slotAllowsPosition(row.position, p))) {
        continue;
      }
      row.entry = entry;
      break;
    }
  }

  return rows;
}

export function countAssignedRosterRows(rows: AssignedRosterRow[]): number {
  return rows.filter((r) => r.entry != null).length;
}
