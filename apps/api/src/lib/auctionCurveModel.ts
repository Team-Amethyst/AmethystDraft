/** Matches AmethystAPI `auction_curve_model` request/response values. */
export type AuctionCurveModel =
  | "linear_v1"
  | "tiered_surplus_v1"
  | "adaptive_surplus_v1";

/** Production default — economics-based resolver on the Engine. */
export const PRODUCTION_AUCTION_CURVE_MODEL: AuctionCurveModel =
  "adaptive_surplus_v1";

/**
 * Curve model for Engine valuation requests.
 * Explicit body override wins; otherwise production adaptive resolver.
 */
export function resolveAuctionCurveModelForDraftRequest(input?: {
  auction_curve_model?: AuctionCurveModel;
}): AuctionCurveModel {
  const m = input?.auction_curve_model;
  if (
    m === "linear_v1" ||
    m === "tiered_surplus_v1" ||
    m === "adaptive_surplus_v1"
  ) {
    return m;
  }
  return PRODUCTION_AUCTION_CURVE_MODEL;
}
