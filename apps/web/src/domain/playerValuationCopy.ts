/**
 * Shared copy for visible players without Engine valuation rows.
 * Visible universe ≠ valuation-eligible pool (see draftablePoolSemantics.ts).
 */

import { formatCurrencyWhole } from "../utils/valuation";

export const NO_VALUATION_LABEL = "No valuation";

export const NO_VALUATION_INELIGIBLE_DETAIL =
  "Insufficient projection/model data";

export const NO_VALUATION_DEPTH_CHART_DETAIL =
  "This player is visible from depth chart data but is not currently in the valuation model.";

export const WATCHLIST_REQUIRES_CATALOG_TOOLTIP =
  "Watchlist and notes require a catalog player record. This depth chart player is not in the valuation catalog yet.";

export const COMMAND_CENTER_REQUIRES_CATALOG_TOOLTIP =
  "Command Center draft search requires a catalog player record.";

/** Research table auction column when the player is visible but not valued. */
export function researchAuctionValueCellTitle(args: {
  maskEngineColumns: boolean;
  valuationEligible?: boolean;
  showOutsideEnginePoolMinBidTooltip: boolean;
  outsideEnginePoolTooltip: string;
  auctionValueTooltip: string;
}): string {
  if (args.maskEngineColumns) return args.auctionValueTooltip;
  if (args.showOutsideEnginePoolMinBidTooltip) {
    return args.outsideEnginePoolTooltip;
  }
  if (args.valuationEligible === false) {
    return `${NO_VALUATION_LABEL}. ${NO_VALUATION_INELIGIBLE_DETAIL}`;
  }
  return args.auctionValueTooltip;
}

/** Research auction column primary cell text (not loading state). */
export function formatResearchAuctionValueDisplay(
  primaryValue: number | undefined,
  valuationEligible?: boolean,
): string {
  if (valuationEligible === false && primaryValue === undefined) {
    return NO_VALUATION_LABEL;
  }
  return formatCurrencyWhole(primaryValue);
}
