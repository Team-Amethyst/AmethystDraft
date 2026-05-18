import PosBadge from "../PosBadge";
import type { PositionMarket } from "../../pages/commandCenterUtils";

function MarketSummaryRow({
  label,
  value,
  title,
  valueClassName = "mp-summary-row__value",
  empty = false,
}: {
  label: string;
  value: string;
  title?: string;
  valueClassName?: string;
  empty?: boolean;
}) {
  return (
    <div className="mp-summary-row" title={title}>
      <span className="mp-summary-row__label">{label}</span>
      <div className="mp-summary-row__value-col">
        <span
          className={
            valueClassName + (empty ? " mp-summary-row__value--muted" : "")
          }
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function CommandCenterLeftMarketCard({
  posMarket,
  eligibleMarketSlots,
  activeMarketSlot,
  onSelectMarketSlot,
}: {
  posMarket: PositionMarket | null;
  eligibleMarketSlots: string[];
  activeMarketSlot: string | null;
  onSelectMarketSlot: (slot: string) => void;
}) {
  const inflationValueTone =
    posMarket && posMarket.avgWinPrice > 0 ? "inflation" : "muted";

  return (
    <section className="cc-surface-card cc-surface-card--left cc-left-market-card">
      <div className="pac-snapshot-header cc-left-market-head cc-panel-controls">
        <span className="market-section-label">Position market</span>
        {eligibleMarketSlots.length > 1 ? (
          <div
            className="stat-view-toggle cc-left-market-pos-toggle"
            role="tablist"
            aria-label="Position market"
          >
            {eligibleMarketSlots.map((position) => (
              <button
                key={position}
                type="button"
                role="tab"
                aria-selected={position === activeMarketSlot}
                className={
                  "svt-btn " + (position === activeMarketSlot ? "active" : "")
                }
                onClick={() => onSelectMarketSlot(position)}
                title={`Market and tier supply for ${position}`}
              >
                {position}
              </button>
            ))}
          </div>
        ) : posMarket ? (
          <PosBadge pos={posMarket.position} />
        ) : null}
      </div>

      <div
        className="mp-summary-rows cc-left-market-summary"
        aria-label="Position market summary"
      >
        <MarketSummaryRow
          label="Avg winning price"
          value={
            posMarket && posMarket.avgWinPrice > 0
              ? `$${posMarket.avgWinPrice}`
              : "—"
          }
          empty={!posMarket || posMarket.avgWinPrice <= 0}
        />
        <MarketSummaryRow
          label="Draftroom avg $"
          value={
            posMarket && posMarket.avgProjValue > 0
              ? `$${posMarket.avgProjValue}`
              : "—"
          }
          title="Draftroom catalog list $ mean for undrafted players at this position"
          empty={!posMarket || posMarket.avgProjValue <= 0}
        />
        <MarketSummaryRow
          label="Draftroom spend vs $"
          value={
            posMarket && posMarket.avgWinPrice > 0
              ? `${posMarket.inflation > 0 ? "+" : ""}${posMarket.inflation}%`
              : "—"
          }
          title="Draftroom-local: avg auction price paid at this position vs Draftroom avg $ (not Engine inflation)"
          valueClassName={`mp-summary-row__value mp-summary-row__value--${inflationValueTone}`}
          empty={!posMarket || posMarket.avgWinPrice <= 0}
        />
      </div>

      {posMarket?.supply?.length ? (
        <div className="cc-left-market-tiers">
          <div className="cc-left-market-tiers-head">
            <span className="cc-left-market-tiers-label">Value tiers</span>
            <span
              className="cc-left-market-tiers-legend"
              title="Undrafted players at this position by auction value band ($25+, $15–24, $10–14, $5–9, $1–4). Count left, then average $."
            >
              Left / avg $
            </span>
          </div>
          <table className="msr-tier-table msr-tier-table--5col cc-left-market-tier-table">
            <thead>
              <tr>
                {([1, 2, 3, 4, 5] as const).map((tier) => (
                  <th key={tier} scope="col">
                    <span
                      className={`msr-tier-chip msr-tier-chip--${tier}`}
                      title={`Value tier ${tier} (auction dollar band)`}
                    >
                      {tier}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {([1, 2, 3, 4, 5] as const).map((tier) => {
                  const tierRow = posMarket.supply.find((r) => r.tier === tier);
                  const count = tierRow?.count ?? 0;
                  const avgVal = tierRow?.avgVal;
                  return (
                    <td key={tier}>
                      <div className="msr-tier-cell-stack">
                        <span
                          className="msr-tier-cell-rem"
                          title="Undrafted players remaining in this tier"
                        >
                          {count}
                        </span>
                        <span
                          className="msr-tier-cell-avg"
                          title="Average Draftroom $ for players in this tier"
                        >
                          {avgVal != null ? `$${avgVal}` : "—"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
