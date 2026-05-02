import type { Player } from "../types/player";

function nameMatchScore(fullLower: string, q: string): number | null {
  const parts = fullLower.split(/\s+/);
  if (fullLower.startsWith(q)) return 0;
  if (parts.some((part) => part.startsWith(q))) return 1;
  if (parts.some((part) => part.includes(q))) return 2;
  if (fullLower.includes(q)) return 3;
  return null;
}

/**
 * Ranks undrafted players for the auction typeahead. Ordering rules are documented in
 * `docs/business-heuristics.md`.
 */
export function searchRankedAvailablePlayers(
  allPlayers: Player[],
  draftedIds: Set<string>,
  rawQuery: string,
  options?: { limit?: number },
): Player[] {
  const limit = options?.limit ?? 8;
  if (rawQuery.length < 1) return [];
  const q = rawQuery.toLowerCase().trim();
  const available = allPlayers.filter((p) => !draftedIds.has(p.id));
  const scored = available.flatMap((p) => {
    const full = p.name.toLowerCase();
    const score = nameMatchScore(full, q);
    if (score == null) return [];
    return [{ p, score }];
  });
  return scored
    .sort((a, b) => a.score - b.score || (a.p.adp ?? 999) - (b.p.adp ?? 999))
    .map((x) => x.p)
    .slice(0, limit);
}
