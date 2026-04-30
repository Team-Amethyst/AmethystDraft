export function CommandCenterRightBidContextCard({
  selectedCeiling,
  maxBid,
  budgetLeft,
  dollarsPerSpot,
}: {
  selectedCeiling: number | undefined;
  maxBid: number | undefined;
  budgetLeft: number | undefined;
  dollarsPerSpot: number | undefined;
}) {
  return (
    <section className="cc-surface-card cc-surface-card--right">
      <div className="rp-section-label">BID CONTEXT</div>
      <div className="rp-bid-context-grid">
        <div className="budget-card budget-card--row">
          <div className="bc-label">Ceiling</div>
          <div className="bc-val">{selectedCeiling != null ? `$${Math.round(selectedCeiling)}` : "—"}</div>
        </div>
        <div className="budget-card budget-card--row">
          <div className="bc-label">Max Bid</div>
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
