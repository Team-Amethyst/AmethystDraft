import type { RosterEntry } from "../api/roster";
import { normalizePlayerPositions, slotAllowsPosition } from "./eligibility";

export interface TeamSummary {
  name: string;
  spent: number;
  filled: number;
  open: number;
  remaining: number;
  maxBid: number;
  ppSpot: number;
}

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

type AssignedRosterRow = {
  position: string;
  entry: RosterEntry | null;
};

export function rosterSlotsToRecord(
  rosterSlots: Record<string, number> | Array<{ position?: unknown; count?: unknown }> | unknown,
): Record<string, number> {
  if (rosterSlots == null || typeof rosterSlots !== "object") {
    return {};
  }

  if (Array.isArray(rosterSlots)) {
    const out: Record<string, number> = {};

    for (const row of rosterSlots) {
      if (row && typeof row === "object") {
        const record = row as { position?: unknown; count?: unknown };
        const position = String(record.position ?? "").trim();
        const count = Number(record.count);

        if (position && Number.isFinite(count)) {
          out[position] = Math.max(0, Math.floor(count));
        }
      }
    }

    return out;
  }

  const out: Record<string, number> = {};

  for (const [slot, count] of Object.entries(rosterSlots as Record<string, unknown>)) {
    const parsed = Number(count);

    if (Number.isFinite(parsed)) {
      out[slot] = Math.max(0, Math.floor(parsed));
    }
  }

  return out;
}

function orderedSlotKeys(rosterSlots: Record<string, number>): string[] {
  const keys = Object.keys(rosterSlots);
  const preferred = ROSTER_SLOT_PICK_ORDER.filter((key) => keys.includes(key));
  const preferredSet = new Set<string>(preferred);
  const rest = keys.filter((key) => !preferredSet.has(key));

  return [...preferred, ...rest];
}

export function rosterSlotsSum(rosterSlots: Record<string, number>): number {
  return Object.values(rosterSlotsToRecord(rosterSlots)).reduce(
    (sum, count) => sum + count,
    0,
  );
}

export function isReserveRosterSlot(rosterSlot: string | undefined | null): boolean {
  const slot = (rosterSlot ?? "").toUpperCase();
  return slot.includes("MIN") || slot.includes("TAXI");
}

export function isReserveEntry(entry: RosterEntry): boolean {
  return isReserveRosterSlot(entry.rosterSlot);
}

export function isActiveAuctionEntry(entry: RosterEntry): boolean {
  return !isReserveEntry(entry);
}

export function isDraftAuctionEntry(entry: RosterEntry): boolean {
  return isActiveAuctionEntry(entry) && !entry.isKeeper;
}

export function filterActiveAuctionEntries(entries: readonly RosterEntry[]): RosterEntry[] {
  return entries.filter(isActiveAuctionEntry);
}

export function filterDraftAuctionEntries(entries: readonly RosterEntry[]): RosterEntry[] {
  return entries.filter(isDraftAuctionEntry);
}

export function filterReserveEntries(entries: readonly RosterEntry[]): RosterEntry[] {
  return entries.filter(isReserveEntry);
}

export function activeAuctionEntriesForTeam(
  entries: readonly RosterEntry[],
  teamId: string,
): RosterEntry[] {
  return filterActiveAuctionEntries(entries).filter((entry) => entry.teamId === teamId);
}

export function assignTeamEntriesToRosterRows(
  rosterSlots: Record<string, number>,
  teamEntries: RosterEntry[],
): AssignedRosterRow[] {
  const rows: AssignedRosterRow[] = [];

  for (const position of orderedSlotKeys(rosterSlots)) {
    const count = rosterSlots[position] ?? 0;

    for (let i = 0; i < count; i += 1) {
      rows.push({ position, entry: null });
    }
  }

  const sorted = [...teamEntries].sort(
    (a, b) =>
      new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
      new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
  );

  for (const entry of sorted) {
    const positions = normalizePlayerPositions(entry.positions, entry.rosterSlot);

    if (positions.length === 0) {
      continue;
    }

    for (const row of rows) {
      if (row.entry) {
        continue;
      }

      if (!positions.some((position) => slotAllowsPosition(row.position, position))) {
        continue;
      }

      row.entry = entry;
      break;
    }
  }

  return rows;
}

export function countAssignedRosterRows(rows: AssignedRosterRow[]): number {
  return rows.filter((row) => row.entry !== null).length;
}

export function teamRosterSlotCounts(
  rosterSlots: Record<string, number>,
  teamEntries: RosterEntry[],
): { totalSlots: number; filled: number; open: number } {
  const rows = assignTeamEntriesToRosterRows(rosterSlots, teamEntries);
  const filled = countAssignedRosterRows(rows);
  const totalSlots = rows.length;

  return {
    totalSlots,
    filled,
    open: Math.max(0, totalSlots - filled),
  };
}

export function computeTeamData(
  league: {
    teamNames: string[];
    rosterSlots: Record<string, number>;
    budget: number;
    teams?: number;
  },
  entries: RosterEntry[],
): TeamSummary[] {
  const names = league.teamNames.length > 0
    ? league.teamNames
    : Array.from({ length: league.teams ?? 0 }, (_, index) => `Team ${index + 1}`);
  const rosterSlots = rosterSlotsToRecord(league.rosterSlots);

  return names.map((name, index) => {
    const teamId = `team_${index + 1}`;
    const teamEntries = activeAuctionEntriesForTeam(entries, teamId);
    const spent = teamEntries.reduce((sum, entry) => sum + entry.price, 0);
    const { filled, open } = teamRosterSlotCounts(rosterSlots, teamEntries);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    const ppSpot = open > 0 ? Number((remaining / open).toFixed(1)) : 0;

    return { name, spent, filled, open, remaining, maxBid, ppSpot };
  });
}
