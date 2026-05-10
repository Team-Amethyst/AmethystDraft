import "./PlayerDetailModalDesignMock.css";

/**
 * Dev-only static layout mock for Player Detail (Option C).
 * Does not import production modal code. No API calls.
 */
const SAMPLE = {
  name: "Corbin Carroll",
  headshot:
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <rect width="160" height="160" fill="#141022"/>
        <circle cx="80" cy="62" r="26" fill="#2a2438" stroke="#3d3552" stroke-width="2"/>
        <ellipse cx="80" cy="118" rx="34" ry="22" fill="#2a2438" stroke="#3d3552" stroke-width="2"/>
      </svg>`,
    ),
  team: "ARI",
  modelRank: 14,
  modelTier: 2,
  positions: ["OF"] as const,
  age: 24,
  mlbId: 682998,
  indicator: "Fair Value",
  drafted: "Available",
  valuation: [
    { label: "Auction Value", value: "$38" },
    { label: "Max Bid", value: "$41" },
    { label: "Team Value", value: "$36" },
    { label: "Roster Edge", value: "−$2" },
  ],
  notes:
    "Ceiling chase only under $36; if early nominators anchor power OFs past $42, fade and bank " +
    "the middle outfield tier. Prefer keeping BA/SB balance vs pure HR.",
  batting: [
    { stat: "AVG", proj: ".284", y1: ".272", y3: ".278" },
    { stat: "HR", proj: "22", y1: "25", y3: "18" },
    { stat: "RBI", proj: "78", y1: "76", y3: "71" },
    { stat: "R", proj: "102", y1: "98", y3: "94" },
    { stat: "SB", proj: "42", y1: "54", y3: "40" },
  ],
  pitching: [
    { stat: "ERA", proj: "—", y1: "—", y3: "—" },
    { stat: "WHIP", proj: "—", y1: "—", y3: "—" },
    { stat: "W", proj: "—", y1: "—", y3: "—" },
    { stat: "SV", proj: "—", y1: "—", y3: "—" },
    { stat: "K", proj: "—", y1: "—", y3: "—" },
  ],
};

export default function PlayerDetailModalDesignMock() {
  const p = SAMPLE;
  return (
    <div className="pdm-design-overlay" role="presentation">
      <div
        className="pdm-design-shell"
        role="dialog"
        aria-label="Player detail design preview (static)"
      >
        <div className="pdm-design-body">
          <div className="pdm-design-split">
            <aside className="pdm-design-rail" aria-label="Player identity and profile">
              <div className="pdm-design-rail-inner">
                <img
                  className="pdm-design-headshot"
                  src={p.headshot}
                  alt=""
                  width={160}
                  height={160}
                />
                <div className="pdm-design-rail-copy">
                  <h2 className="pdm-design-name">{p.name}</h2>
                  <p className="pdm-design-meta">
                    {p.team}
                    <span className="pdm-design-meta-sep" aria-hidden="true">
                      {" "}
                      ·{" "}
                    </span>
                    Model rank {p.modelRank}
                    <span className="pdm-design-meta-sep" aria-hidden="true">
                      {" "}
                      ·{" "}
                    </span>
                    Model tier {p.modelTier}
                  </p>
                  <div className="pdm-design-chips" aria-label="Positions">
                    {p.positions.map((pos) => (
                      <span key={pos} className="pdm-design-chip">
                        {pos}
                      </span>
                    ))}
                  </div>
                  <div className="pdm-design-profile">
                    <h3 className="pdm-design-profile-heading">Profile</h3>
                    <dl className="pdm-design-dl">
                      <dt>Age</dt>
                      <dd>{p.age}</dd>
                      <dt>MLB ID</dt>
                      <dd>{p.mlbId}</dd>
                      <dt>Indicator</dt>
                      <dd>{p.indicator}</dd>
                      <dt>Drafted</dt>
                      <dd>{p.drafted}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </aside>

            <div className="pdm-design-workspace">
              <section className="pdm-design-card" aria-label="Valuation summary">
                <h3 className="pdm-design-section-kicker">Valuation</h3>
                <div className="pdm-design-metrics" role="list">
                  {p.valuation.map((m) => (
                    <div key={m.label} className="pdm-design-metric" role="listitem">
                      <span className="pdm-design-metric-label">{m.label}</span>
                      <span className="pdm-design-metric-value">{m.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="pdm-design-card pdm-design-card--notes" aria-label="Draft notes">
                <h3 className="pdm-design-section-kicker">Draft Notes</h3>
                <textarea
                  className="pdm-design-notes"
                  readOnly
                  value={p.notes}
                  aria-label="Draft notes (sample)"
                />
              </section>

              <section className="pdm-design-card" aria-label="Performance snapshot">
                <h3 className="pdm-design-section-kicker">Performance Snapshot</h3>
                <div className="pdm-design-snap-grid">
                  <div className="pdm-design-snap-block">
                    <h4 className="pdm-design-snap-block-title">Batting</h4>
                    <div className="pdm-design-table">
                      <div className="pdm-design-row pdm-design-row--head">
                        <span>Stat</span>
                        <span>PROJ</span>
                        <span>1Y</span>
                        <span>3Y</span>
                      </div>
                      {p.batting.map((row) => (
                        <div key={row.stat} className="pdm-design-row">
                          <span>{row.stat}</span>
                          <span>{row.proj}</span>
                          <span>{row.y1}</span>
                          <span>{row.y3}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pdm-design-snap-block">
                    <h4 className="pdm-design-snap-block-title">Pitching</h4>
                    <div className="pdm-design-table">
                      <div className="pdm-design-row pdm-design-row--head">
                        <span>Stat</span>
                        <span>PROJ</span>
                        <span>1Y</span>
                        <span>3Y</span>
                      </div>
                      {p.pitching.map((row) => (
                        <div key={row.stat} className="pdm-design-row">
                          <span>{row.stat}</span>
                          <span>{row.proj}</span>
                          <span>{row.y1}</span>
                          <span>{row.y3}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <details className="pdm-design-details">
                <summary className="pdm-design-details-summary">Why this value?</summary>
                <div className="pdm-design-details-body">
                  <p>
                    Sample explanation only: replacement context, surplus basis, and inflation are
                    summarized here in production. Kept short for layout review.
                  </p>
                </div>
              </details>

              <details className="pdm-design-details">
                <summary className="pdm-design-details-summary">Model notes</summary>
                <div className="pdm-design-details-body">
                  <p>Sample outlook or driver bullets would render in this panel.</p>
                </div>
              </details>
            </div>
          </div>
        </div>

        <footer className="pdm-design-footer">
          <p className="pdm-design-foot-note">
            Stat lens: projections · Layout preview — static data only.
          </p>
          <div className="pdm-design-foot-actions">
            <button type="button" className="pdm-design-btn pdm-design-btn--ghost" disabled>
              Close
            </button>
            <button type="button" className="pdm-design-btn pdm-design-btn--primary" disabled>
              Draft in Command Center
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
