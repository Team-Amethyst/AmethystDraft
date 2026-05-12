import { valuationSortLabel, valuationTooltip } from "../../utils/valuation";

export function CommandCenterRightBidContextCard({
  suggestedBidDollars,
  maxBid,
  budgetLeft,
  dollarsPerSpot,
}: {
  /** Engine `recommended_bid` only (not league list value). */
  suggestedBidDollars: number | undefined;
  maxBid: number | undefined;
  budgetLeft: number | undefined;
  dollarsPerSpot: number | undefined;
}) {
  return (
    <section className="cc-surface-card cc-surface-card--right">
      <div className="rp-section-label">BID CONTEXT</div>
      <div className="rp-bid-context-grid">
        <div className="budget-card budget-card--row">
          <div className="bc-label" title={valuationTooltip("recommended_bid")}>
            {valuationSortLabel("recommended_bid")}
          </div>
          <div className="bc-val">
            {suggestedBidDollars != null ? `$${Math.round(suggestedBidDollars)}` : "—"}
          </div>
        </div>
        <div className="budget-card budget-card--row">
          <div
            className="bc-label"
            title="Maximum legal next bid from your remaining budget and open roster spots (not the model Max Bid from the engine)."
          >
            Budget max
          </div>
          <div className="bc-val">{maxBid != null ? `$${maxBid}` : "—"}</div>
        </div>
        <div className="budget-card budget-card--row">
          <div className="bc-label">Budget Left</div>
          <div className="bc-val">{budgetLeft != null ? `$${budgetLeft}` : "—"}</div>
        </div>
        <div className="budget-card budget-card--row">
          <div className="bc-label">$/Spot</div>
          <div className="bc-val">{dollarsPerSpot != null ? `$${dollarsPerSpot}` : "—"}</div>
        </div>
      </div>
    </section>
  );
}
