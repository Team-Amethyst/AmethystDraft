/**
 * mockDraftAI.ts
 *
 * Isolated AI decision engine for the mock draft.
 * All AI logic lives here — bidding strategy, nominations, roster needs.
 * Pure functions only — no React, no side effects.
 */

import type { Player } from "../types/player";

export interface AIRoster {
  teamName: string;
  budget: number;
  spent: number;
  picks: AIPick[];
  isUser: boolean;
}

export interface AIPick {
  player: Player;
  price: number;
  slot: string;
}

// ─── Position helpers ─────────────────────────────────────────────────────────

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

// How many of each position a team wants (default 5x5 roster)
const DEFAULT_NEEDS: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1,
  OF: 3, UTIL: 1, SP: 2, RP: 2, BN: 4,
};

function getPositionFromPlayer(player: Player): string {
  return player.positions?.[0] ?? player.position ?? "UTIL";
}

function isPitcher(player: Player): boolean {
  const pos = getPositionFromPlayer(player);
  return PITCHER_POSITIONS.has(pos);
}

// How many more of a position this team still needs
export function positionNeed(
  roster: AIRoster,
  position: string,
  rosterSlots: Record<string, number>,
): number {
  const slots = rosterSlots[position] ?? DEFAULT_NEEDS[position] ?? 0;
  const filled = roster.picks.filter((p) => p.slot === position).length;
  return Math.max(0, slots - filled);
}

// Total open slots remaining
export function openSlots(
  roster: AIRoster,
  rosterSlots: Record<string, number>,
): number {
  const total = Object.values(rosterSlots).reduce((a, b) => a + b, 0);
  return total - roster.picks.length;
}

// Find the best slot for a player on this roster
function findBestSlot(
  player: Player,
  roster: AIRoster,
  rosterSlots: Record<string, number>,
): string {
  const pos = getPositionFromPlayer(player);
  if (positionNeed(roster, pos, rosterSlots) > 0) return pos;
  if (!isPitcher(player) && positionNeed(roster, "UTIL", rosterSlots) > 0) return "UTIL";
  if (positionNeed(roster, "BN", rosterSlots) > 0) return "BN";
  return "BN";
}

// ─── AI bid decision ──────────────────────────────────────────────────────────

/**
 * Decide how much an AI team is willing to bid on a player.
 * Returns 0 if the team should not bid.
 */
export function aiMaxBid(
  player: Player,
  roster: AIRoster,
  currentBid: number,
  rosterSlots: Record<string, number>,
  allRosters: AIRoster[],
  undraftedPlayers: Player[],
): number {
  const remaining = roster.budget - roster.spent;
  const open = openSlots(roster, rosterSlots);

  // Must keep $1 per remaining open slot (can't go broke)
  const mustKeep = Math.max(0, open - 1);
  const spendable = remaining - mustKeep;

  if (spendable <= 1) return 0;

  const pos = getPositionFromPlayer(player);
  const need = positionNeed(roster, pos, rosterSlots);

  // No interest if position is already filled and no UTIL/BN room
  const hasUtilRoom = !isPitcher(player) && positionNeed(roster, "UTIL", rosterSlots) > 0;
  const hasBnRoom = positionNeed(roster, "BN", rosterSlots) > 0;
  if (need === 0 && !hasUtilRoom && !hasBnRoom) return 0;

  // Base value from player projection
  const baseValue = player.value ?? 0;
  if (baseValue <= 0) return 0;

  // Scarcity multiplier — how many comparable players are left?
  const comparable = undraftedPlayers.filter((p) => {
    const ppos = getPositionFromPlayer(p);
    return ppos === pos && (p.value ?? 0) >= baseValue * 0.7;
  });
  const scarcityMultiplier = comparable.length <= 2 ? 1.25
    : comparable.length <= 5 ? 1.1
    : 1.0;

  // Need multiplier — higher need = willing to pay more
  const needMultiplier = need >= 2 ? 1.15 : need === 1 ? 1.05 : 0.85;

  // Budget ratio — spend more when you have plenty left relative to needs
  const budgetRatio = open > 0 ? spendable / open : 0;
  const budgetMultiplier = budgetRatio > baseValue * 1.5 ? 1.1 : 1.0;

  const maxWilling = Math.floor(
    baseValue * scarcityMultiplier * needMultiplier * budgetMultiplier,
  );

  // Only bid if it makes financial sense
  if (currentBid >= maxWilling) return 0;

  // Return what they'd bid next (current + 1), capped at their max
  const nextBid = currentBid + 1;
  if (nextBid > maxWilling || nextBid > spendable) return 0;

  return Math.min(nextBid, spendable, maxWilling);
}

// ─── AI nomination ────────────────────────────────────────────────────────────

/**
 * Pick the best player for an AI team to nominate.
 * Strategy: nominate a player at their position of greatest need,
 * preferably one that other teams also want (drives up prices for rivals).
 */
export function aiNominate(
  roster: AIRoster,
  undraftedPlayers: Player[],
  rosterSlots: Record<string, number>,
  allRosters: AIRoster[],
): Player | null {
  if (undraftedPlayers.length === 0) return null;

  // Find positions with greatest need
  const posNeeds = Object.entries(rosterSlots)
    .map(([pos]) => ({ pos, need: positionNeed(roster, pos, rosterSlots) }))
    .filter((p) => p.need > 0)
    .sort((a, b) => b.need - a.need);

  // Try to nominate best available at highest-need position
  for (const { pos } of posNeeds) {
    const candidates = undraftedPlayers
      .filter((p) => getPositionFromPlayer(p) === pos)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    if (candidates.length > 0) {
      // Occasionally nominate the 2nd or 3rd best to be unpredictable
      const idx = Math.random() < 0.75 ? 0 : Math.min(1, candidates.length - 1);
      return candidates[idx];
    }
  }

  // Fallback: nominate best available overall
  return undraftedPlayers.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null;
}

// ─── Suggestion engine ────────────────────────────────────────────────────────

/**
 * Suggest the best player for the USER to nominate on their turn.
 * Considers: watchlist priority, position need, value, and scarcity.
 */
export function suggestNomination(
  userRoster: AIRoster,
  watchlist: Player[],
  undraftedPlayers: Player[],
  rosterSlots: Record<string, number>,
  allRosters: AIRoster[],
): { player: Player; reason: string } | null {
  const undraftedIds = new Set(undraftedPlayers.map((p) => p.id));

  // First: check watchlist for available players
  const availableWatchlist = watchlist
    .filter((p) => undraftedIds.has(p.id))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  if (availableWatchlist.length > 0) {
    const top = availableWatchlist[0];
    const pos = getPositionFromPlayer(top);
    const need = positionNeed(userRoster, pos, rosterSlots);
    const remaining = undraftedPlayers.filter(
      (p) => getPositionFromPlayer(p) === pos && (p.value ?? 0) >= (top.value ?? 0) * 0.8,
    ).length;

    const reason = need > 0
      ? remaining <= 3
        ? `High value ${pos} — only ${remaining} comparable left`
        : `On your watchlist and fills your ${pos} need`
      : `On your watchlist — consider BN slot`;

    return { player: top, reason };
  }

  // Second: best available at most-needed position
  const posNeeds = Object.entries(rosterSlots)
    .map(([pos]) => ({ pos, need: positionNeed(userRoster, pos, rosterSlots) }))
    .filter((p) => p.need > 0)
    .sort((a, b) => b.need - a.need);

  for (const { pos } of posNeeds) {
    const best = undraftedPlayers
      .filter((p) => getPositionFromPlayer(p) === pos)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];

    if (best) {
      const remaining = undraftedPlayers.filter(
        (p) => getPositionFromPlayer(p) === pos,
      ).length;
      return {
        player: best,
        reason: remaining <= 3
          ? `Only ${remaining} ${pos}s left — nominate now before they're gone`
          : `Best available ${pos} — fills your roster need`,
      };
    }
  }

  // Fallback: best available overall
  const best = undraftedPlayers.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return best ? { player: best, reason: "Best available player overall" } : null;
}

// ─── Snake order ──────────────────────────────────────────────────────────────

/**
 * Generate the full snake nomination order for N teams and R rounds.
 * Returns array of team indices.
 * e.g. 3 teams, 2 rounds: [0,1,2, 2,1,0]
 */
export function buildSnakeOrder(numTeams: number, numRounds: number): number[] {
  const order: number[] = [];
  for (let r = 0; r < numRounds; r++) {
    const round = Array.from({ length: numTeams }, (_, i) => i);
    if (r % 2 === 1) round.reverse();
    order.push(...round);
  }
  return order;
}