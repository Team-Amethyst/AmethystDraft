/**
 * Shared copy for visible players without Engine valuation rows.
 * Visible universe ≠ valuation-eligible pool (see draftablePoolSemantics.ts).
 */

export const NO_VALUATION_LABEL = "No valuation";

export const NO_VALUATION_INELIGIBLE_DETAIL =
  "Insufficient projection/model data";

export const NO_VALUATION_DEPTH_CHART_DETAIL =
  "This player is visible from depth chart data but is not currently in the valuation model.";

export const DEPTH_CHART_MODAL_NO_VALUATION_TITLE = "No valuation available";

export const DEPTH_CHART_MODAL_DEPTH_ONLY_DETAIL =
  "This player appears in MLB depth chart data but does not have a Draftroom catalog record.";

export const DEPTH_CHART_MODAL_CATALOG_ONLY_DETAIL =
  "This player exists in Draftroom's player catalog, but is not currently included in the Engine valuation pool.";

export const WATCHLIST_REQUIRES_CATALOG_TOOLTIP =
  "Watchlist and notes require a catalog player record. This depth chart player is not in the valuation catalog yet.";

export const COMMAND_CENTER_REQUIRES_CATALOG_TOOLTIP =
  "Command Center draft search requires a catalog player record.";

export {
  formatResearchAuctionValueDisplay,
  researchAuctionValueCellTitle,
} from "./researchAuctionValueDisplay";
