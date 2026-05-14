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

const DEFAULT_NEEDS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  SS: 1,
  "3B": 1,
  OF: 3,
  UTIL: 1,
  SP: 2,
  RP: 2,
  BN: 4,
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function playerAuctionValue(player: Player): number {
  const data = player as Player & {
    auction_value?: unknown;
    adjusted_value?: unknown;
    team_adjusted_value?: unknown;
    recommended_bid?: unknown;
  };

  return (
    finiteNumber(data.auction_value) ??
    finiteNumber(data.team_adjusted_value) ??
    finiteNumber(data.recommended_bid) ??
    finiteNumber(data.adjusted_value) ??
    finiteNumber(player.value) ??
    0
  );
}

function getPositionFromPlayer(player: Player): string {
  return player.positions?.[0] ?? player.position ?? "UTIL";
}

function isPitcher(player: Player): boolean {
  const pos = getPositionFromPlayer(player);
  return PITCHER_POSITIONS.has(pos);
}

function rosterSlotCount(rosterSlots: Record<string, number>, position: string): number {
  return rosterSlots[position] ?? DEFAULT_NEEDS[position] ?? 0;
}

function totalRosterSlots(rosterSlots: Record<string, number>): number {
  const configured = Object.values(rosterSlots).reduce(
    (sum, value) => sum + value,
    0,
  );

  if (configured > 0) {
    return configured;
  }

  return Object.values(DEFAULT_NEEDS).reduce((sum, value) => sum + value, 0);
}

export function positionNeed(
  roster: AIRoster,
  position: string,
  rosterSlots: Record<string, number>,
): number {
  const slots = rosterSlotCount(rosterSlots, position);
  const filled = roster.picks.filter((pick) => pick.slot === position).length;

  return Math.max(0, slots - filled);
}

export function openSlots(
  roster: AIRoster,
  rosterSlots: Record<string, number>,
): number {
  return Math.max(0, totalRosterSlots(rosterSlots) - roster.picks.length);
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

  const baseValue = playerAuctionValue(player);
  if (baseValue <= 0) return 0;

  const comparable = undraftedPlayers.filter((candidate) => {
    const candidatePosition = getPositionFromPlayer(candidate);
    return (
      candidatePosition === pos &&
      playerAuctionValue(candidate) >= baseValue * 0.7
    );
  });

  const scarcityMultiplier =
    comparable.length <= 2 ? 1.25 :
    comparable.length <= 5 ? 1.1 :
    1.0;

  const needMultiplier =
    need >= 2 ? 1.15 :
    need === 1 ? 1.05 :
    0.85;

  const budgetPerOpenSlot = open > 0 ? spendable / open : 0;
  const budgetMultiplier = budgetPerOpenSlot > baseValue * 1.5 ? 1.1 : 1.0;

  const maxWilling = Math.floor(
    baseValue * scarcityMultiplier * needMultiplier * budgetMultiplier,
  );

  if (currentBid >= maxWilling) return 0;

  let nextBid = 0;

  if (currentBid <= 1) {
    nextBid = Math.max(2, Math.floor(maxWilling * 0.65));
  } else {
    const headroom = maxWilling - currentBid;

    const incrementPct =
      headroom > 20 ? 0.3 :
      headroom > 10 ? 0.4 :
      headroom > 5 ? 0.6 :
      1.0;

    const increment = Math.max(1, Math.floor(headroom * incrementPct));
    nextBid = currentBid + increment;
  }

  if (nextBid > maxWilling || nextBid > spendable) return 0;

  return Math.min(nextBid, spendable, maxWilling);
}

export function aiNominate(
  roster: AIRoster,
  undraftedPlayers: Player[],
  rosterSlots: Record<string, number>,
): Player | null {
  if (undraftedPlayers.length === 0) return null;

  const neededPositions = Object.keys({
    ...DEFAULT_NEEDS,
    ...rosterSlots,
  })
    .map((pos) => ({
      pos,
      need: positionNeed(roster, pos, rosterSlots),
    }))
    .filter((row) => row.need > 0)
    .sort((a, b) => b.need - a.need);

  for (const row of neededPositions) {
    const candidates = undraftedPlayers
      .filter((player) => getPositionFromPlayer(player) === row.pos)
      .sort((a, b) => playerAuctionValue(b) - playerAuctionValue(a));

    if (candidates.length > 0) {
      const index = Math.random() < 0.75 ? 0 : Math.min(1, candidates.length - 1);
      return candidates[index];
    }
  }

  return [...undraftedPlayers].sort(
    (a, b) => playerAuctionValue(b) - playerAuctionValue(a),
  )[0] ?? null;
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
    .sort((a, b) => playerAuctionValue(b) - playerAuctionValue(a));

  if (availableWatchlist.length > 0) {
    const player = availableWatchlist[0];
    const pos = getPositionFromPlayer(player);
    const need = positionNeed(userRoster, pos, rosterSlots);

    const comparableLeft = undraftedPlayers.filter((candidate) => {
      return (
        getPositionFromPlayer(candidate) === pos &&
        playerAuctionValue(candidate) >= playerAuctionValue(player) * 0.8
      );
    }).length;

    const reason =
      need > 0
        ? comparableLeft <= 3
          ? `High-value ${pos}. Only ${comparableLeft} similar players left.`
          : `Watchlist target who fills your ${pos} need.`
        : "Top watchlist target still available. Consider bench or utility.";

    return {
      player,
      reason,
    };
  }

  const neededPositions = Object.keys({
    ...DEFAULT_NEEDS,
    ...rosterSlots,
  })
    .map((pos) => ({
      pos,
      need: positionNeed(userRoster, pos, rosterSlots),
    }))
    .filter((row) => row.need > 0)
    .sort((a, b) => b.need - a.need);

  for (const row of neededPositions) {
    const best = undraftedPlayers
      .filter((player) => getPositionFromPlayer(player) === row.pos)
      .sort((a, b) => playerAuctionValue(b) - playerAuctionValue(a))[0];

    if (best) {
      const remainingAtPosition = undraftedPlayers.filter(
        (player) => getPositionFromPlayer(player) === row.pos,
      ).length;

      return {
        player: best,
        reason:
          remainingAtPosition <= 3
            ? `Only ${remainingAtPosition} ${row.pos} players left. Nominate before the position dries up.`
            : `Best available ${row.pos} for your roster build.`,
      };
    }
  }

  const best = [...undraftedPlayers].sort(
    (a, b) => playerAuctionValue(b) - playerAuctionValue(a),
  )[0];

  return best
    ? {
        player: best,
        reason: "Best available player overall.",
      }
    : null;
}

export function buildSnakeOrder(numTeams: number, numRounds: number): number[] {
  const order: number[] = [];

  for (let round = 0; round < numRounds; round++) {
    const row = Array.from({ length: numTeams }, (_, index) => index);

    if (round % 2 === 1) {
      row.reverse();
    }

    order.push(...row);
  }

  return order;
}