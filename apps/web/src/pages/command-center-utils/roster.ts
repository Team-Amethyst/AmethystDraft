import type { RosterEntry } from "../../api/roster";
import type { League } from "../../contexts/LeagueContext";
import { getEligibleSlotsForPosition, getEligibleSlotsForPositions } from "../../utils/eligibility";

export interface TeamSummary {
  name: string;
  spent: number;
  filled: number;
  open: number;
  remaining: number;
  maxBid: number;
  ppSpot: number;
}

/** Mirrors API engineContext: auction board picks only (excludes keepers, minors, taxi). */
export function isEngineAuctionBoardEntry(entry: RosterEntry): boolean {
  if (entry.isKeeper) return false;
  const slot = (entry.rosterSlot ?? "").toUpperCase();
  if (slot.includes("MIN")) return false;
  if (slot.includes("TAXI")) return false;
  return true;
}

/** Per-team roster slots from league settings (same basis as engine roster_slot_count_sum). */
export function rosterSlotsPerTeam(league: League): number {
  return Object.values(league.rosterSlots).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );
}

/** League-wide auction slots still empty (pre-draft or in-draft), excluding keepers/minors/taxi rows. */
export function leagueWideAuctionSlotsRemaining(
  league: League,
  entries: RosterEntry[],
): number {
  const cap = rosterSlotsPerTeam(league) * league.teams;
  const onBoard = entries.filter(isEngineAuctionBoardEntry).length;
  return Math.max(0, cap - onBoard);
}

export function computeTeamData(
  league: League,
  entries: RosterEntry[],
): TeamSummary[] {
  const totalSlots = Object.values(league.rosterSlots).reduce((a, b) => a + b, 0);
  return league.teamNames.map((name, i) => {
    const teamId = `team_${i + 1}`;
    const mine = entries.filter((e) => e.teamId === teamId);
    const spent = mine.reduce((s, e) => s + e.price, 0);
    const filled = mine.length;
    const open = Math.max(0, totalSlots - filled);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    const ppSpot = open > 0 ? +(remaining / open).toFixed(1) : 0;
    return { name, spent, filled, open, remaining, maxBid, ppSpot };
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

  const teamIdx = league.teamNames.indexOf(teamName);
  if (teamIdx === -1) return false;
  const teamId = `team_${teamIdx + 1}`;

  const filled = new Map<string, number>();
  rosterEntries
    .filter((e) => e.teamId === teamId)
    .forEach((e) => filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1));

  return eligible.some((s) => (filled.get(s) ?? 0) < (league.rosterSlots[s] ?? 1));
}
