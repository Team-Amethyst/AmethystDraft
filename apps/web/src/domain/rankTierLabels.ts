/** Tooltip copy for rank / tier columns (truthful vs market ADP). */

export const MODEL_RANK_TOOLTIP =
  "Internal rank from the model, not market ADP.";

export const AUCTION_RANK_TOOLTIP =
  "Rank by current league auction value.";

export const STRENGTH_RANK_TOOLTIP =
  "Rank by baseline player strength before auction economics.";

export const STRENGTH_TIER_TOOLTIP =
  "Tier by baseline player strength before auction economics.";

export const MODEL_TIER_TOOLTIP =
  "Internal model grouping.";

export const AUCTION_TIER_TOOLTIP =
  "Grouping by current auction value.";

/** Column header when the Market ADP column is visible (multiple rows may mix sources). */
export const MARKET_ADP_COLUMN_TOOLTIP =
  "External average draft position when reported by a market source.";

/**
 * Tooltip for a player’s market ADP line.
 * When `source` is missing, does not pretend a provider name.
 */
export function marketAdpTooltip(source?: string | null): string {
  const s =
    typeof source === "string" && source.trim() !== ""
      ? source.trim()
      : undefined;
  if (s) return `External average draft position from ${s}.`;
  return "External average draft position.";
}

function finiteField(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export type MarketAdpTooltipFields = {
  market_adp_source?: string;
  market_adp_updated_at?: string;
  market_adp_min?: number;
  market_adp_max?: number;
  market_pick_count?: number;
};

/** Full tooltip including optional freshness and Engine-reported range / sample size. */
export function marketAdpDetailTooltip(
  fields: MarketAdpTooltipFields | undefined | null,
): string {
  let text = marketAdpTooltip(fields?.market_adp_source);

  const raw = fields?.market_adp_updated_at;
  if (typeof raw === "string" && raw.trim() !== "") {
    const d = new Date(raw.trim());
    if (!Number.isNaN(d.getTime())) {
      text = `${text} Updated ${d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}.`;
    }
  }

  const mn = finiteField(fields?.market_adp_min);
  const mx = finiteField(fields?.market_adp_max);
  if (mn !== undefined && mx !== undefined) {
    text = `${text} Range ${mn}–${mx}.`;
  } else if (mn !== undefined) {
    text = `${text} Min ${mn}.`;
  } else if (mx !== undefined) {
    text = `${text} Max ${mx}.`;
  }

  const pc = finiteField(fields?.market_pick_count);
  if (pc !== undefined && pc > 0) {
    const rounded = Math.round(pc);
    text = `${text} Sample size: ${rounded} picks.`;
  }

  return text;
}
