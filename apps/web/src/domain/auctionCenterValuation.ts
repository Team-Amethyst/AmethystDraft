import type { ValuationExplain, ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  formatDollar,
  valuationExplainHasRiskRoleContent,
} from "../utils/valuation";

/** Finite engine/catalog number, or null. */
export function engineFiniteOrNull(
  n: number | undefined | null,
): number | null {
  if (n == null) return null;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function formatSuggestedBidLine(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatDollar(Math.round(n));
}

export function formatEdgeLine(edge: number | undefined): string {
  if (edge === undefined || !Number.isFinite(edge)) return "—";
  const rounded = Math.round(edge);
  const absText = String(Math.abs(rounded));
  if (rounded > 0) return `+${absText}`;
  if (rounded < 0) return `-${absText}`;
  return "0";
}

/** Same finite merge as `mergeDisplayValuationRow` for your value and recommended bid only. */
export function cleanedYourValueAndRecommendedBid(
  valuationRow: ValuationResult | undefined | null,
  player: Player,
): { yourValue: number; bid: number } | null {
  const yourValue =
    engineFiniteOrNull(valuationRow?.team_adjusted_value) ??
    engineFiniteOrNull(player.team_adjusted_value);
  const bid =
    engineFiniteOrNull(valuationRow?.recommended_bid) ??
    engineFiniteOrNull(player.recommended_bid);
  if (yourValue == null || bid == null) return null;
  return { yourValue, bid };
}

export function valueMinusBidDeltaRounded(yourValue: number, bid: number): number {
  return Math.round(yourValue - bid);
}

export type ValueVsBidVerdict = {
  tone: "pos" | "neg" | "muted";
  cardTone: "overpay" | "value" | "fair";
  danger: boolean;
  strong: boolean;
  label: string;
};

/** See `docs/business-heuristics.md` for threshold rationale. */
export function verdictFromValueMinusBid(
  delta: number,
  opts?: { bidRelativeStar?: boolean },
): ValueVsBidVerdict {
  const bidRelativeStar = opts?.bidRelativeStar === true;
  if (bidRelativeStar && delta < 0) {
    return {
      tone: "muted",
      cardTone: "fair",
      danger: false,
      strong: delta > 10,
      label: "Bid-relative",
    };
  }
  const cardTone =
    delta < -10 ? "overpay" : delta > 5 ? "value" : "fair";
  const danger = delta < -15;
  const strong = delta > 10;
  const tone =
    delta > 2 ? "pos" : delta < -2 ? "neg" : "muted";
  const label =
    delta > 0 ? "Strong Value" : delta < 0 ? "Overpay" : "Fair Price";
  return { tone, cardTone, danger, strong, label };
}

/** `recommended_bid` capped by max bid (wallet); never falls back to other valuation fields. */
export function actionableBidFromRecommendedAndMaxBid(
  row: ValuationResult | undefined,
  maxBid: number | undefined | null,
): number | null {
  const r = row ? engineFiniteOrNull(row.recommended_bid) : null;
  if (r == null) return null;
  if (maxBid != null && Number.isFinite(maxBid)) return Math.min(r, maxBid);
  return r;
}

/** Merge engine row with catalog `Player` optional valuation fields when the row omits them. */
export function mergeDisplayValuationRow(
  row: ValuationResult | undefined,
  player: Player,
): ValuationResult | undefined {
  if (!row) return undefined;
  return {
    ...row,
    auction_value:
      engineFiniteOrNull(row.auction_value) ??
      engineFiniteOrNull(player.auction_value) ??
      row.auction_value,
    recommended_bid:
      engineFiniteOrNull(row.recommended_bid) ??
      engineFiniteOrNull(player.recommended_bid) ??
      row.recommended_bid,
    team_adjusted_value:
      engineFiniteOrNull(row.team_adjusted_value) ??
      engineFiniteOrNull(player.team_adjusted_value) ??
      row.team_adjusted_value,
    adjusted_value:
      engineFiniteOrNull(row.adjusted_value) ??
      engineFiniteOrNull(player.adjusted_value) ??
      row.adjusted_value,
    baseline_value:
      engineFiniteOrNull(row.baseline_value) ??
      engineFiniteOrNull(player.baseline_value) ??
      row.baseline_value,
    edge: engineFiniteOrNull(row.edge) ?? undefined,
    recommended_bid_note: row.recommended_bid_note ?? player.recommended_bid_note,
    edge_note: row.edge_note ?? player.edge_note,
    valuation_explain: row.valuation_explain ?? player.valuation_explain,
    explain_v2: row.explain_v2 ?? player.explain_v2,
    why: row.why ?? player.why,
  };
}

/** Replacement / inflation / warnings block inside `valuation_explain` (Command Center bid reason). */
export function valuationExplainHasBidContextTable(ve: ValuationExplain): boolean {
  return Boolean(
    ve.effective_positions?.length ||
      ve.replacement_key_used ||
      ve.replacement_value_used != null ||
      ve.surplus_basis ||
      ve.inflation_factor != null ||
      ve.pool_to_slot_ratio != null ||
      (ve.scoring_category_warnings?.length ?? 0) > 0,
  );
}

/** True when any Engine field should populate the “Why this bid?” disclosure (merged row + catalog). */
export function bidReasonDisclosureHasEngineContent(
  row: ValuationResult | undefined | null,
  player: Player,
): boolean {
  const merged = mergeDisplayValuationRow(row ?? undefined, player);
  const base = merged ?? row ?? undefined;
  const rb =
    (typeof base?.recommended_bid_note === "string" ? base.recommended_bid_note.trim() : "") ||
    (typeof player.recommended_bid_note === "string" ? player.recommended_bid_note.trim() : "");
  const en =
    (typeof base?.edge_note === "string" ? base.edge_note.trim() : "") ||
    (typeof player.edge_note === "string" ? player.edge_note.trim() : "");
  if (rb !== "" || en !== "") return true;
  const ve = base?.valuation_explain ?? player.valuation_explain;
  if (ve && (valuationExplainHasBidContextTable(ve) || valuationExplainHasRiskRoleContent(ve))) {
    return true;
  }
  const v2 = base?.explain_v2 ?? player.explain_v2;
  if (v2 && (v2.drivers?.length ?? 0) > 0) return true;
  if (v2 && v2.indicator) return true;
  const why = base?.why ?? player.why;
  if (why && why.length > 0) return true;
  return false;
}
