import type { CatalogKind, Player } from "../types/player";

/**
 * Maps catalog API JSON (including legacy `adp` / `tier`) onto canonical Player fields.
 */
export function normalizeCatalogPlayer(raw: Record<string, unknown>): Player {
  const catalog_rank = finite(raw.catalog_rank) ?? finite(raw.adp) ?? 0;
  const catalog_tier = finite(raw.catalog_tier) ?? finite(raw.tier) ?? 5;
  const catalog_kind = parseCatalogKind(raw) ?? "valuation_eligible";
  const veRaw = raw.valuation_eligible ?? raw.valuationEligible;
  const valuation_eligible =
    typeof veRaw === "boolean" ? veRaw : catalog_kind === "valuation_eligible";
  const base = { ...raw } as unknown as Player;
  return {
    ...base,
    catalog_rank,
    catalog_tier,
    catalog_kind,
    valuation_eligible,
    market_adp: finite(raw.market_adp) ?? finite(raw.marketAdp),
    market_adp_source: trimmedString(raw.market_adp_source ?? raw.marketAdpSource),
    market_adp_updated_at: trimmedString(
      raw.market_adp_updated_at ?? raw.marketAdpUpdatedAt,
    ),
    market_adp_min: finite(raw.market_adp_min ?? raw.marketAdpMin),
    market_adp_max: finite(raw.market_adp_max ?? raw.marketAdpMax),
    market_pick_count: finite(raw.market_pick_count ?? raw.marketPickCount),
  };
}

function parseCatalogKind(raw: Record<string, unknown>): CatalogKind | undefined {
  const v = raw.catalog_kind ?? raw.catalogKind;
  if (v === "valuation_eligible" || v === "market_only" || v === "roster_context") {
    return v;
  }
  return undefined;
}

function trimmedString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function finite(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
