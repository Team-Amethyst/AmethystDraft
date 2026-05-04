import type { Player } from "../types/player";

export type TierGroup = { tier: string | number; players: Player[] };

export type TierStats = {
  tier: string | number;
  players: Player[];
  positionCounts: Record<string, number>;
  averageValue: number;
  minValue: number;
  maxValue: number;
  draftedCount: number;
  availableCount: number;
  valueCliffFromPrevious: number | null;
};

export function groupPlayersByTier(
  players: Player[],
): TierGroup[] {
  const map = new Map<string | number, Player[]>();

  for (const p of players) {
    const key = p.tier ?? "unassigned";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    if (a[0] === "unassigned") return 1;
    if (b[0] === "unassigned") return -1;
    const na = Number(a[0]);
    const nb = Number(b[0]);
    return na - nb;
  });

  return entries.map(([tier, arr]) => ({ tier, players: arr }));
}

export function calculateTierStats(
  groups: TierGroup[],
  draftedIds: Set<string>,
): TierStats[] {
  const stats: TierStats[] = [];

  for (let idx = 0; idx < groups.length; idx++) {
    const group = groups[idx];
    const positionCounts: Record<string, number> = {};
    let totalValue = 0;
    let minValue = Infinity;
    let maxValue = -Infinity;
    let draftedCount = 0;

    for (const p of group.players) {
      const pos = p.position || "UNK";
      positionCounts[pos] = (positionCounts[pos] ?? 0) + 1;

      const value = p.team_adjusted_value ?? p.recommended_bid ?? p.adjusted_value ?? 0;
      totalValue += value;
      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);

      if (draftedIds.has(p.id) || draftedIds.has(String(p.mlbId))) {
        draftedCount++;
      }
    }

    const availableCount = group.players.length - draftedCount;
    const averageValue = group.players.length > 0 ? totalValue / group.players.length : 0;

    // Calculate value cliff from previous tier
    const prevStat = idx > 0 ? stats[idx - 1] : null;
    const valueCliffFromPrevious =
      prevStat && prevStat.averageValue > 0
        ? prevStat.averageValue - averageValue
        : null;

    stats.push({
      tier: group.tier,
      players: group.players,
      positionCounts,
      averageValue,
      minValue: minValue === Infinity ? 0 : minValue,
      maxValue: maxValue === -Infinity ? 0 : maxValue,
      draftedCount,
      availableCount,
      valueCliffFromPrevious,
    });
  }

  return stats;
}

export function sortPlayersByValue(
  players: Player[],
  sortBy: "recommended_bid" | "team_adjusted_value" | "adjusted_value" = "recommended_bid",
): Player[] {
  return [...players].sort((a, b) => {
    const getVal = (p: Player) => {
      if (sortBy === "recommended_bid") return p.recommended_bid ?? 0;
      if (sortBy === "team_adjusted_value") return p.team_adjusted_value ?? 0;
      return p.adjusted_value ?? 0;
    };
    return getVal(b) - getVal(a);
  });
}

export function formatCurrency(value: number): string {
  return `$${Math.round(value)}`;
}
