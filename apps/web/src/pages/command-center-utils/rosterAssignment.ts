import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import { resolvedLeagueTeamNames } from "../../utils/team";
import {
  getEligibleSlotsForPositions,
  normalizePlayerPositions,
  slotAllowsPosition,
} from "../../utils/eligibility";

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

/** Slots from `slots` that still have capacity for `teamName` under `league.rosterSlots`. */
export function availableSlotsForTeamName(
  league: League | null | undefined,
  teamName: string,
  slots: string[],
  roster: RosterEntry[],
): Set<string> {
  if (!league) return new Set(slots);
  const names = resolvedLeagueTeamNames(league);
  const teamIdx = names.indexOf(teamName);
  if (teamIdx === -1) return new Set(slots);
  const teamId = `team_${teamIdx + 1}`;
  const teamRoster = roster.filter((e) => e.teamId === teamId);
  const filled = new Map<string, number>();
  teamRoster.forEach((e) => {
    filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1);
  });
  return new Set(
    slots.filter((s) => (filled.get(s) ?? 0) < (league.rosterSlots[s] ?? 1)),
  );
}

/**
 * Open/filled counts aligned with {@link assignTeamEntriesToRosterRows} (Team Makeup UI).
 * Raw `entries.length` can exceed visually empty slots when picks lack eligibility data
 * or cannot be placed in remaining rows.
 */
export function teamRosterSlotCounts(
  rosterSlots: Record<string, number>,
  teamEntries: RosterEntry[],
): { totalSlots: number; filled: number; open: number } {
  const rows = assignTeamEntriesToRosterRows(rosterSlots, teamEntries);
  const filled = countAssignedRosterRows(rows);
  const totalSlots = rows.length;
  return { totalSlots, filled, open: Math.max(0, totalSlots - filled) };
}
