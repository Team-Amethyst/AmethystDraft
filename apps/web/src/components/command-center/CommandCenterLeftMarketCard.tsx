import PosBadge from "../PosBadge";
import type { PositionMarket } from "../../pages/commandCenterUtils";

export function CommandCenterLeftMarketCard({
  posMarket,
  eligibleMarketPositions,
  activeMarketPosition,
  onSelectMarketPosition,
}: {
  posMarket: PositionMarket | null;
  eligibleMarketPositions: string[];
  activeMarketPosition: string | null;
  onSelectMarketPosition: (position: string) => void;
}) {
  return (
    <section className="cc-surface-card cc-surface-card--left">
      <div className="market-section-label">
        {posMarket ? posMarket.position : "—"} MARKET
        {posMarket && <PosBadge pos={posMarket.position} />}
      </div>
      {eligibleMarketPositions.length > 1 ? (
        <div className="market-pos-tabs" aria-label="Market position scope">
          {eligibleMarketPositions.map((pos) => (
            <button
              key={pos}
              className={"market-pos-tab " + (pos === activeMarketPosition ? "active" : "")}
              onClick={() => onSelectMarketPosition(pos)}
              title={`Show market + scarcity for ${pos}`}
            >
              {pos}
            </button>
          ))}
        </div>
      ) : null}
      <div className="market-stat-row">
        <span className="msr-label">AVG WINNING PRICE</span>
        <span className="msr-value">
          {posMarket && posMarket.avgWinPrice > 0 ? `$${posMarket.avgWinPrice}` : "—"}
        </span>
      </div>
      <div
        className="market-stat-row"
        title="Draftroom catalog list $ mean for undrafted players at this position"
      >
        <span className="msr-label">DRAFTROOM AVG $</span>
        <span className="msr-value green">
          {posMarket && posMarket.avgProjValue > 0 ? `$${posMarket.avgProjValue}` : "—"}
        </span>
      </div>
      <div
        className="market-stat-row"
        title="Draftroom-local: avg auction price paid at this position vs Draftroom avg $ (not Engine inflation)"
      >
        <span className="msr-label">DRAFTROOM SPEND VS $</span>
        <span
          className={`msr-value ${
            posMarket && posMarket.inflation > 0
              ? "yellow"
              : posMarket && posMarket.inflation < 0
                ? "green"
                : ""
          }`}
        >
          {posMarket && posMarket.avgWinPrice > 0
            ? `${posMarket.inflation > 0 ? "+" : ""}${posMarket.inflation}%`
            : "—"}
        </span>
      </div>
      {posMarket?.supply?.length ? (
        <>
          <div className="cc-divider" />
          <div className="msr-tier-header-row">
            <span className="market-section-label msr-tier-section-label">POSITION TIERS</span>
            <span
              className="msr-tier-legend"
              title="Per tier: undrafted count at this position, then average Draftroom catalog $"
            >
              Remaining / Avg $
            </span>
          </div>
          <table className="msr-tier-table msr-tier-table--5col">
            <thead>
              <tr>
                {([1, 2, 3, 4, 5] as const).map((tier) => (
                  <th key={tier} scope="col">
                    <span className={`msr-tier-chip msr-tier-chip--${tier}`} title={`Tier ${tier}`}>
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
                        <span className="msr-tier-cell-rem" title="Undrafted players remaining in this tier">
                          {count}
                        </span>
                        <span className="msr-tier-cell-avg" title="Average Draftroom $ for players in this tier">
                          {avgVal != null ? `$${avgVal}` : "—"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
