/** Canonical valuation row resolution when display names collide in Engine output. */

export function normValuationPlayerName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type ValuationRowLike = {
  name?: string;
  player_id?: string;
  auction_value?: number;
};

export type CatalogPlayerRef = {
  id: string;
  name: string;
};

/** Draftroom catalog ids keyed by normalized display name. */
export function buildCatalogIdByNormName(
  catalog: readonly CatalogPlayerRef[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of catalog) {
    const key = normValuationPlayerName(p.name);
    if (!key) continue;
    if (!out.has(key)) out.set(key, String(p.id).trim());
  }
  return out;
}

/**
 * When multiple valuation rows share a normalized name, prefer the catalog player_id
 * (same row Research/CC join on), else draftable highest auction_value.
 */
export function pickCanonicalValuationRowForName(
  vals: readonly ValuationRowLike[],
  draftable: ReadonlySet<string>,
  displayName: string,
  catalogIdByNorm?: ReadonlyMap<string, string>,
): ValuationRowLike | undefined {
  const key = normValuationPlayerName(displayName);
  if (!key) return undefined;

  const catalogId = catalogIdByNorm?.get(key);
  if (catalogId) {
    const catalogRows = vals.filter(
      (v) => String(v.player_id ?? "").trim() === catalogId,
    );
    if (catalogRows.length > 0) {
      let bestCatalog = catalogRows[0]!;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const row of catalogRows) {
        const pid = String(row.player_id ?? "").trim();
        const inPool = draftable.has(pid);
        const av = row.auction_value ?? 0;
        const score = (inPool ? 2_000_000 : 0) + av;
        if (score > bestScore) {
          bestScore = score;
          bestCatalog = row;
        }
      }
      return bestCatalog;
    }
  }

  let best: ValuationRowLike | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const row of vals) {
    if (!row.name || normValuationPlayerName(row.name) !== key) continue;
    const pid = String(row.player_id ?? "").trim();
    if (!pid) continue;
    const inPool = draftable.has(pid);
    const av = row.auction_value ?? 0;
    const score = (inPool ? 1_000_000 : 0) + av;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

export function buildCanonicalPlayerIdByNormName(
  vals: readonly ValuationRowLike[],
  draftable: ReadonlySet<string>,
  catalogIdByNorm?: ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  const names = new Set<string>();
  for (const v of vals) {
    if (v.name) names.add(normValuationPlayerName(v.name));
  }
  for (const name of names) {
    const row = pickCanonicalValuationRowForName(
      vals,
      draftable,
      name,
      catalogIdByNorm,
    );
    if (row?.player_id) out.set(name, String(row.player_id));
  }
  return out;
}

export type NameCollision = {
  norm_name: string;
  rows: Array<{
    player_id: string;
    name: string;
    auction_value: number | null;
    in_draftable_pool: boolean;
  }>;
};

export function findValuationNameCollisions(
  vals: readonly ValuationRowLike[],
  draftable: ReadonlySet<string>,
): NameCollision[] {
  const buckets = new Map<string, NameCollision["rows"]>();
  for (const v of vals) {
    if (!v.name) continue;
    const key = normValuationPlayerName(v.name);
    const pid = String(v.player_id ?? "").trim();
    if (!key || !pid) continue;
    const list = buckets.get(key) ?? [];
    list.push({
      player_id: pid,
      name: String(v.name),
      auction_value:
        typeof v.auction_value === "number" ? v.auction_value : null,
      in_draftable_pool: draftable.has(pid),
    });
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([norm_name, rows]) => ({
      norm_name,
      rows: rows.sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0)),
    }));
}
