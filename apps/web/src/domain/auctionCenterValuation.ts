import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import { formatDollar } from "../utils/valuation";

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
export function verdictFromValueMinusBid(delta: number): ValueVsBidVerdict {
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
  };
}
