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

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

function getPositionFromPlayer(player: Player): string {
  return player.positions?.[0] ?? player.position ?? "UTIL";
}

function isPitcher(player: Player): boolean {
  return PITCHER_POSITIONS.has(getPositionFromPlayer(player));
}

export function positionNeed(
  roster: AIRoster,
  position: string,
  rosterSlots: Record<string, number>,
): number {
  const slots = rosterSlots[position] ?? 0;
  const filled = roster.picks.filter((pick) => pick.slot === position).length;
  return Math.max(0, slots - filled);
}

export function openSlots(
  roster: AIRoster,
  rosterSlots: Record<string, number>,
): number {
  const total = Object.values(rosterSlots).reduce((sum, value) => sum + value, 0);
  return total - roster.picks.length;
}

export function aiMaxBid(
  player: Player,
  roster: AIRoster,
  currentBid: number,
  rosterSlots: Record<string, number>,
  undraftedPlayers: Player[],
): number {
  const remaining = roster.budget - roster.spent;
  const open = openSlots(roster, rosterSlots);
  const mustKeep = Math.max(0, open - 1);
  const spendable = remaining - mustKeep;

  if (spendable <= 1) return 0;

  const pos = getPositionFromPlayer(player);
  const need = positionNeed(roster, pos, rosterSlots);
  const hasUtilRoom = !isPitcher(player) && positionNeed(roster, "UTIL", rosterSlots) > 0;
  const hasBenchRoom = positionNeed(roster, "BN", rosterSlots) > 0;

  if (need === 0 && !hasUtilRoom && !hasBenchRoom) return 0;

  const baseValue = player.value ?? 0;
  if (baseValue <= 0) return 0;

  const comparable = undraftedPlayers.filter((p) => {
    return getPositionFromPlayer(p) === pos && (p.value ?? 0) >= baseValue * 0.7;
  });

  const scarcityMultiplier =
    comparable.length <= 2 ? 1.25 : comparable.length <= 5 ? 1.1 : 1.0;

  const needMultiplier = need >= 2 ? 1.15 : need === 1 ? 1.05 : 0.85;
  const maxWilling = Math.floor(baseValue * scarcityMultiplier * needMultiplier);

  if (currentBid >= maxWilling) return 0;

  const headroom = maxWilling - currentBid;
  const increment =
    currentBid <= 1
      ? Math.max(2, Math.floor(maxWilling * 0.65))
      : currentBid + Math.max(1, Math.floor(headroom * 0.45));

  return Math.min(increment, spendable, maxWilling);
}

export function aiNominate(
  roster: AIRoster,
  undraftedPlayers: Player[],
  rosterSlots: Record<string, number>,
): Player | null {
  if (undraftedPlayers.length === 0) return null;

  const neededPositions = Object.keys(rosterSlots)
    .map((pos) => ({ pos, need: positionNeed(roster, pos, rosterSlots) }))
    .filter((row) => row.need > 0)
    .sort((a, b) => b.need - a.need);

  for (const row of neededPositions) {
    const best = undraftedPlayers
      .filter((player) => getPositionFromPlayer(player) === row.pos)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];

    if (best) return best;
  }

  return [...undraftedPlayers].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null;
}

export function suggestNomination(
  userRoster: AIRoster,
  watchlist: Player[],
  undraftedPlayers: Player[],
  rosterSlots: Record<string, number>,
): { player: Player; reason: string } | null {
  const undraftedIds = new Set(undraftedPlayers.map((player) => player.id));

  const availableWatchlist = watchlist
    .filter((player) => undraftedIds.has(player.id))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  if (availableWatchlist.length > 0) {
    const player = availableWatchlist[0];
    const pos = getPositionFromPlayer(player);
    const need = positionNeed(userRoster, pos, rosterSlots);

    return {
      player,
      reason: need > 0 ? `Watchlist target who fills ${pos}.` : "Top watchlist target still available.",
    };
  }

  const neededPositions = Object.keys(rosterSlots)
    .map((pos) => ({ pos, need: positionNeed(userRoster, pos, rosterSlots) }))
    .filter((row) => row.need > 0)
    .sort((a, b) => b.need - a.need);

  for (const row of neededPositions) {
    const best = undraftedPlayers
      .filter((player) => getPositionFromPlayer(player) === row.pos)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];

    if (best) {
      return {
        player: best,
        reason: `Best available ${row.pos} for your roster build.`,
      };
    }
  }

  const best = [...undraftedPlayers].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return best ? { player: best, reason: "Best available player overall." } : null;
}

export function buildSnakeOrder(numTeams: number, numRounds: number): number[] {
  const order: number[] = [];

  for (let round = 0; round < numRounds; round++) {
    const row = Array.from({ length: numTeams }, (_, index) => index);
    if (round % 2 === 1) row.reverse();
    order.push(...row);
  }

  return order;
}