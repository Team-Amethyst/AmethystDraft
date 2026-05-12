import type { ValuationResponse } from "../../api/engine";

export function CommandCenterRightMarketPressureCard({
  engineMarket,
  marketClass,
  inflationTitle,
  inflationGaugeValue,
  isReplacementSlotsV2,
  enginePlayersKpiLabel,
  enginePlayersKpiTitle,
}: {
  engineMarket: ValuationResponse | null;
  marketClass: "" | "hot" | "warm" | "cool" | "neutral";
  inflationTitle: string | undefined;
  inflationGaugeValue: number | undefined;
  isReplacementSlotsV2: boolean;
  enginePlayersKpiLabel: string | undefined;
  enginePlayersKpiTitle: string | undefined;
}) {
  return (
    <section className="cc-surface-card cc-surface-card--right">
      <div className="rp-section-label">MARKET PRESSURE</div>
      {engineMarket ? (
        <div className={`engine-market-card ${marketClass}`}>
          <div className="engine-market-main">
            <div className="engine-market-kpi" title={inflationTitle}>
              <div className="em-label em-label--inflation">Inflation Index</div>
              <div className="em-value em-value--inflation">
                {inflationGaugeValue != null
                  ? `${inflationGaugeValue.toFixed(2)}×`
                  : isReplacementSlotsV2
                    ? "N/A"
                    : "—"}
              </div>
            </div>
            <div className="engine-market-kpi">
              <div className="em-label">Budget Left</div>
              <div className="em-value">${engineMarket.total_budget_remaining}</div>
            </div>
            <div className="engine-market-kpi">
              <div className="em-label" title={enginePlayersKpiTitle}>
                {enginePlayersKpiLabel ?? "Players Remaining"}
              </div>
              <div className="em-value">{engineMarket.players_remaining}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="engine-market-empty">Engine market snapshot unavailable.</div>
      )}
    </section>
  );
}
