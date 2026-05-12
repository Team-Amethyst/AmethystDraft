import type { Player } from "../types/player";

function nameMatchScore(fullLower: string, q: string): number | null {
  const parts = fullLower.split(/\s+/);

  if (fullLower.startsWith(q)) return 0;
  if (parts.some((part) => part.startsWith(q))) return 1;
  if (parts.some((part) => part.includes(q))) return 2;
  if (fullLower.includes(q)) return 3;

  return null;
}

function playerRank(player: Player): number {
  return Number.isFinite(player.adp) ? player.adp : 999;
}

export function searchRankedAvailablePlayers(
  allPlayers: Player[],
  draftedIds: Set<string>,
  rawQuery: string,
  options?: { limit?: number },
): Player[] {
  const limit = options?.limit ?? 8;
  const q = rawQuery.toLowerCase().trim();

  if (q.length < 1) return [];

  const scored = allPlayers
    .filter((player) => !draftedIds.has(player.id))
    .flatMap((player) => {
      const score = nameMatchScore(player.name.toLowerCase(), q);
      if (score === null) return [];
      return [{ player, score }];
    });

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        playerRank(a.player) - playerRank(b.player),
    )
    .map((row) => row.player)
    .slice(0, limit);
}