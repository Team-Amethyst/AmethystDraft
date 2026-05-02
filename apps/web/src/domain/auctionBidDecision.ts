import type { Player } from "../types/player";
import { playerValuationEdgeOrDiff } from "../utils/valuation";

/** Heuristic thresholds for research / roster UI; see `docs/business-heuristics.md`. */

/** Dollar thresholds on value diff (your value vs likely bid, or engine edge). */
export const AUCTION_VALUE_DIFF_THRESHOLDS = {
  /** At or above: show strong “value” signal */
  strongValue: 7,
  /** At or above (but below strongValue): slight value */
  slightValue: 2,
  /** At or below: strong overpay warning */
  strongOverpay: -7,
  /** At or below (but above strongOverpay): price sensitive */
  slightOverpay: -2,
} as const;

export type AuctionDecisionSignal =
  | "Neutral"
  | "Aggressive target"
  | "Slight value"
  | "Likely overpay"
  | "Price sensitive";

/**
 * UI label for the bid / value gap. Uses the same value-diff definition as research tables
 * (`playerValuationEdgeOrDiff`).
 */
export function auctionDecisionSignalFromPlayer(
  player: Pick<Player, "edge" | "recommended_bid" | "team_adjusted_value">,
): AuctionDecisionSignal {
  return auctionDecisionSignalFromValueDiff(playerValuationEdgeOrDiff(player));
}

export function auctionDecisionSignalFromValueDiff(
  valueDiffDollars: number | undefined | null,
): AuctionDecisionSignal {
  if (valueDiffDollars == null || !Number.isFinite(valueDiffDollars)) {
    return "Neutral";
  }
  const v = valueDiffDollars;
  if (v >= AUCTION_VALUE_DIFF_THRESHOLDS.strongValue) return "Aggressive target";
  if (v >= AUCTION_VALUE_DIFF_THRESHOLDS.slightValue) return "Slight value";
  if (v <= AUCTION_VALUE_DIFF_THRESHOLDS.strongOverpay) return "Likely overpay";
  if (v <= AUCTION_VALUE_DIFF_THRESHOLDS.slightOverpay) return "Price sensitive";
  return "Neutral";
}

function finiteDollar(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * Single “target bid” line for quick UI: prefer likely bid, then your value, then market.
 */
export function auctionTargetBidDollars(
  player: Pick<Player, "recommended_bid" | "team_adjusted_value" | "adjusted_value">,
): number | undefined {
  return (
    finiteDollar(player.recommended_bid) ??
    finiteDollar(player.team_adjusted_value) ??
    finiteDollar(player.adjusted_value)
  );
}
