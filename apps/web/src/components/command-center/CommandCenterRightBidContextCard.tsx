function BidContextRow({
  label,
  value,
  title,
  empty = false,
}: {
  label: string;
  value: string;
  title?: string;
  empty?: boolean;
}) {
  return (
    <div
      className="mp-summary-row"
      title={title}
    >
      <span className="mp-summary-row__label">{label}</span>
      <div className="mp-summary-row__value-col">
        <span
          className={
            "mp-summary-row__value" +
            (empty ? " mp-summary-row__value--muted" : "")
          }
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function CommandCenterRightBidContextCard({
  maxBid,
  budgetLeft,
  dollarsPerSpot,
}: {
  maxBid: number | undefined;
  budgetLeft: number | undefined;
  dollarsPerSpot: number | undefined;
}) {
  return (
    <section className="cc-surface-card cc-surface-card--right cc-bid-context-card">
      <div className="rp-section-label">BID CONTEXT</div>
      <div
        className="mp-summary-rows cc-bid-context-rows"
        aria-label="Bid context summary"
      >
        <BidContextRow
          label="Budget max"
          value={maxBid != null ? `$${maxBid}` : "—"}
          title="Maximum legal next bid from remaining budget and open roster spots for the team selected in Log result."
          empty={maxBid == null}
        />
        <BidContextRow
          label="Budget left"
          value={budgetLeft != null ? `$${budgetLeft}` : "—"}
          empty={budgetLeft == null}
        />
        <BidContextRow
          label="$/slot"
          value={dollarsPerSpot != null ? `$${dollarsPerSpot}` : "—"}
          empty={dollarsPerSpot == null}
        />
      </div>
    </section>
  );
}
