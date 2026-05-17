import type { MarketPressureViewModel } from "../../pages/commandCenterMarket";

export function CommandCenterRightMarketPressureCard({
  marketPressure,
}: {
  marketPressure: MarketPressureViewModel | null;
}) {
  if (!marketPressure) {
    return (
      <section className="cc-surface-card cc-surface-card--right">
        <div className="rp-section-label">MARKET PRESSURE</div>
        <div className="engine-market-empty">Engine market snapshot unavailable.</div>
      </section>
    );
  }

  const { primary, secondary, allocatorVsOpen, fromEngine } = marketPressure;

  return (
    <section className="cc-surface-card cc-surface-card--right">
      <div className="rp-section-label">MARKET PRESSURE</div>
      <div className="engine-market-card">
        {!fromEngine ? (
          <p className="engine-market-fallback-note">
            Market pressure snapshot unavailable — limited fallback metrics shown.
          </p>
        ) : null}

        <div className="engine-market-primary" aria-label="Market pressure summary">
          {primary.map((row) => (
            <div
              key={row.id}
              className={`engine-market-state engine-market-state--${row.id.replace(/_/g, "-")}`}
              title={row.title}
            >
              <span className="engine-market-state__label">{row.label}</span>
              <span className="engine-market-state__value">{row.value}</span>
              {row.detail ? (
                <span className="engine-market-state__detail">{row.detail}</span>
              ) : null}
            </div>
          ))}
        </div>

        {secondary.length > 0 ? (
          <div className="engine-market-secondary" aria-label="Market snapshot details">
            {secondary.map((kpi) => (
              <div
                key={kpi.id}
                className="engine-market-kpi engine-market-kpi--secondary"
                title={kpi.title}
              >
                <div className="em-label">{kpi.label}</div>
                <div className="em-value em-value--secondary">{kpi.value}</div>
                {kpi.detail ? <div className="em-detail">{kpi.detail}</div> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div
          className="engine-market-kpi engine-market-kpi--advanced"
          title={[allocatorVsOpen.title, allocatorVsOpen.helpText].filter(Boolean).join(" ")}
        >
          <div className="em-label em-label--vs-open">{allocatorVsOpen.label}</div>
          <div className="em-value em-value--vs-open em-value--advanced">
            {allocatorVsOpen.displayValue}
          </div>
        </div>

        <p className="engine-market-guidance engine-market-guidance--advanced">
          {allocatorVsOpen.helpText}
        </p>
      </div>
    </section>
  );
}
