import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import { resolvedLeagueTeamNames } from "../../utils/team";
import { getEligibleSlotsForPosition, getEligibleSlotsForPositions } from "../../utils/eligibility";
import { teamRosterSlotCounts } from "./rosterAssignment";

export { availableSlotsForTeamName } from "./rosterAssignment";

/**
 * Sum roster slot counts for a team. Handles Mongo `Mixed` shapes: plain
 * `{ SP: 5, ... }` records and `{ position, count }[]` arrays (same as API engineContext).
 */
/** Normalize league `rosterSlots` (record or `{ position, count }[]`) for assignment helpers. */
export function rosterSlotsToRecord(rosterSlots: unknown): Record<string, number> {
  if (rosterSlots == null || typeof rosterSlots !== "object") return {};
  if (Array.isArray(rosterSlots)) {
    const out: Record<string, number> = {};
    for (const row of rosterSlots) {
      if (row && typeof row === "object" && "position" in row && "count" in row) {
        const pos = String((row as { position: unknown }).position).trim();
        const c = (row as { count?: unknown }).count;
        const n = typeof c === "number" ? c : Number(c);
        if (pos && Number.isFinite(n)) {
          out[pos] = Math.max(0, Math.floor(n));
        }
      }
    }
    return out;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rosterSlots as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = Math.max(0, Math.floor(n));
  }
  return out;
}

export function rosterSlotsSumFromUnknown(rosterSlots: unknown): number {
  if (rosterSlots == null || typeof rosterSlots !== "object") return 0;
  if (Array.isArray(rosterSlots)) {
    let sum = 0;
    for (const row of rosterSlots) {
      if (row && typeof row === "object" && "count" in row) {
        const c = (row as { count?: unknown }).count;
        const n = typeof c === "number" ? c : Number(c);
        if (Number.isFinite(n)) sum += Math.max(0, Math.floor(n));
      }
    }
    return sum;
  }
  return Object.values(rosterSlots as Record<string, unknown>).reduce(
    (acc: number, v) => {
      const n = typeof v === "number" ? v : Number(v);
      return acc + (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
    },
    0,
  );
}

export interface TeamSummary {
  name: string;
  spent: number;
  filled: number;
  open: number;
  remaining: number;
  maxBid: number;
  ppSpot: number;
}

/** Minors / taxi reserve pools (not active auction roster). */
export function isReserveRosterSlot(rosterSlot: string | undefined | null): boolean {
  const slot = (rosterSlot ?? "").toUpperCase();
  return slot.includes("MIN") || slot.includes("TAXI");
}

export function isReserveEntry(entry: RosterEntry): boolean {
  return isReserveRosterSlot(entry.rosterSlot);
}

/** Active auction roster: keeper contracts + drafted auction picks (not MIN/TAXI). */
export function isActiveAuctionEntry(entry: RosterEntry): boolean {
  return !isReserveEntry(entry);
}

/** Auction draft pick on the active board (excludes keepers and reserves). */
export function isDraftAuctionEntry(entry: RosterEntry): boolean {
  return isActiveAuctionEntry(entry) && !entry.isKeeper;
}

/** @deprecated Prefer {@link isDraftAuctionEntry} — same behavior. */
export function isEngineAuctionBoardEntry(entry: RosterEntry): boolean {
  return isDraftAuctionEntry(entry);
}

export function filterActiveAuctionEntries(
  entries: readonly RosterEntry[],
): RosterEntry[] {
  return entries.filter(isActiveAuctionEntry);
}

export function filterReserveEntries(
  entries: readonly RosterEntry[],
): RosterEntry[] {
  return entries.filter(isReserveEntry);
}

export function activeAuctionEntriesForTeam(
  entries: readonly RosterEntry[],
  teamId: string,
): RosterEntry[] {
  return filterActiveAuctionEntries(entries).filter((e) => e.teamId === teamId);
}

export function reserveEntriesForTeam(
  entries: readonly RosterEntry[],
  teamId: string,
): RosterEntry[] {
  return filterReserveEntries(entries).filter((e) => e.teamId === teamId);
}

/** Per-team roster slots from league settings (same basis as engine roster_slot_count_sum). */
export function rosterSlotsPerTeam(league: League): number {
  return rosterSlotsSumFromUnknown(league.rosterSlots);
}

/** League-wide auction slots still empty (pre-draft or in-draft), excluding keepers/minors/taxi rows. */
export function leagueWideAuctionSlotsRemaining(
  league: League,
  entries: RosterEntry[],
): number {
  const cap = rosterSlotsPerTeam(league) * league.teams;
  const onBoard = filterActiveAuctionEntries(entries).length;
  return Math.max(0, cap - onBoard);
}

export function computeTeamData(
  league: League,
  entries: RosterEntry[],
): TeamSummary[] {
  const rosterSlots = rosterSlotsToRecord(league.rosterSlots);
  return resolvedLeagueTeamNames(league).map((name, i) => {
    const teamId = `team_${i + 1}`;
    const mine = activeAuctionEntriesForTeam(entries, teamId);
    const totalSpent = mine.reduce((s, e) => s + e.price, 0);
    const { filled, open } = teamRosterSlotCounts(rosterSlots, mine);
    const remaining = Math.max(0, league.budget - totalSpent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    const ppSpot = open > 0 ? +(remaining / open).toFixed(1) : 0;
    return { name, spent: totalSpent, filled, open, remaining, maxBid, ppSpot };
  });
}

export function getEligibleSlots(pos: string, slots: string[]): string[] {
  return getEligibleSlotsForPosition(pos, slots);
}

export function teamCanBid(
  teamName: string,
  positions: string[],
  league: League,
  rosterEntries: RosterEntry[],
): boolean {
  if (positions.length === 0) return true;
  const allSlots = Object.keys(league.rosterSlots);
  const eligible = getEligibleSlotsForPositions(positions, allSlots);
  if (eligible.length === 0) return false;

  const names = resolvedLeagueTeamNames(league);
  const teamIdx = names.indexOf(teamName);
  if (teamIdx === -1) return false;
  const teamId = `team_${teamIdx + 1}`;

  const filled = new Map<string, number>();
  activeAuctionEntriesForTeam(rosterEntries, teamId).forEach((e) =>
    filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1),
  );

  return eligible.some((s) => (filled.get(s) ?? 0) < (league.rosterSlots[s] ?? 1));
}
