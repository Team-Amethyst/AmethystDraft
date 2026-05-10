import "./PlayerDetailModalMock.css";

/**
 * Static, dev-only preview of an Option C split player-detail modal.
 * No data fetching, no persistence, no production modal imports.
 */
const SAMPLE_PLAYER = {
  name: "Shohei Ohtani",
  headshot:
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 128 128">
        <rect width="128" height="128" fill="#141022"/>
        <circle cx="64" cy="52" r="22" fill="#2a2438" stroke="#3d3552" stroke-width="2"/>
        <rect x="36" y="82" width="56" height="28" rx="6" fill="#2a2438" stroke="#3d3552"/>
      </svg>`,
    ),
  team: "LAD",
  modelRank: 3,
  modelTier: 1,
  positions: ["DH", "SP"] as const,
  age: 30,
  mlbId: 660271,
  indicator: "Reach",
  bat: { hr: 54, rbi: 130, sb: 21 },
  pit: { era: "3.14", whip: "1.06", k: 132 },
};

const STATIC_DRAFT_NOTES =
  "Target $48 if the room is thin on power; pivot to the Soto tier if price runs past $52. " +
  "Keep a hard ceiling because two-way scarcity will get bid emotionally.";

const METRICS: { label: string; value: string }[] = [
  { label: "Auction Value", value: "$45" },
  { label: "Max Bid", value: "$52" },
  { label: "Team Value", value: "$42" },
  { label: "Roster Edge", value: "−$3" },
];

export default function PlayerDetailModalMock() {
  const p = SAMPLE_PLAYER;
  return (
    <div className="pdm-mock-overlay" role="presentation">
      <div className="pdm-mock-modal" role="dialog" aria-label="Player detail (static mock)">
        <div className="pdm-mock-body">
          <div className="pdm-mock-split">
            <aside className="pdm-mock-rail" aria-label="Player identity and profile">
              <div className="pdm-mock-identity">
                <img
                  className="pdm-mock-headshot"
                  src={p.headshot}
                  alt=""
                  width={256}
                  height={256}
                />
                <div>
                  <h2 className="pdm-mock-name">{p.name}</h2>
                  <p className="pdm-mock-meta">
                    {p.team} · Model rank {p.modelRank} · Model tier {p.modelTier}
                  </p>
                  <div className="pdm-mock-pos-row" aria-label="Positions">
                    {p.positions.map((pos) => (
                      <span key={pos} className="pdm-mock-pos">
                        {pos}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pdm-mock-profile">
                <h3 className="pdm-mock-profile-title">Profile</h3>
                <dl className="pdm-mock-dl">
                  <dt>Age</dt>
                  <dd>{p.age}</dd>
                  <dt>MLB ID</dt>
                  <dd>{p.mlbId}</dd>
                  <dt>Indicator</dt>
                  <dd>{p.indicator}</dd>
                  <dt>Drafted</dt>
                  <dd>Available</dd>
                </dl>
              </div>
            </aside>

            <div className="pdm-mock-main">
              <button type="button" className="pdm-mock-close" aria-label="Close (mock)" disabled>
                ×
              </button>

              <section aria-label="Valuation summary">
                <div className="pdm-mock-valuation-head">
                  <span className="pdm-mock-section-label">Valuation</span>
                  <span className="pdm-mock-badge">Likely overpay</span>
                </div>
                <div className="pdm-mock-metrics" role="list">
                  {METRICS.map((m) => (
                    <div key={m.label} className="pdm-mock-metric" role="listitem">
                      <span className="pdm-mock-metric-label">{m.label}</span>
                      <span className="pdm-mock-metric-value">{m.value}</span>
                    </div>
                  ))}
                </div>
                <p className="pdm-mock-helper">
                  Max bid is a strategic anchor and may exceed auction value on elite players.
                </p>
              </section>

              <section aria-label="Draft notes">
                <h3 className="pdm-mock-notes-title">Draft Notes</h3>
                <textarea
                  className="pdm-mock-notes-area"
                  readOnly
                  value={STATIC_DRAFT_NOTES}
                  aria-label="Draft notes (read-only mock)"
                />
              </section>

              <section aria-label="Performance snapshot">
                <h3 className="pdm-mock-snap-title">Performance Snapshot</h3>
                <div className="pdm-mock-snap-grid">
                  <div>
                    <h4 className="pdm-mock-snap-block-title">Batting</h4>
                    <div className="pdm-mock-table">
                      <div className="pdm-mock-table-row pdm-mock-table-row--head">
                        <span>Stat</span>
                        <span>Last</span>
                        <span>Proj</span>
                        <span>3Y</span>
                      </div>
                      <div className="pdm-mock-table-row">
                        <span>HR</span>
                        <span>{p.bat.hr}</span>
                        <span>42</span>
                        <span>44</span>
                      </div>
                      <div className="pdm-mock-table-row">
                        <span>RBI</span>
                        <span>{p.bat.rbi}</span>
                        <span>108</span>
                        <span>102</span>
                      </div>
                      <div className="pdm-mock-table-row">
                        <span>SB</span>
                        <span>{p.bat.sb}</span>
                        <span>18</span>
                        <span>17</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="pdm-mock-snap-block-title">Pitching</h4>
                    <div className="pdm-mock-table">
                      <div className="pdm-mock-table-row pdm-mock-table-row--head">
                        <span>Stat</span>
                        <span>Last</span>
                        <span>Proj</span>
                        <span>3Y</span>
                      </div>
                      <div className="pdm-mock-table-row">
                        <span>ERA</span>
                        <span>{p.pit.era}</span>
                        <span>3.35</span>
                        <span>3.42</span>
                      </div>
                      <div className="pdm-mock-table-row">
                        <span>WHIP</span>
                        <span>{p.pit.whip}</span>
                        <span>1.10</span>
                        <span>1.12</span>
                      </div>
                      <div className="pdm-mock-table-row">
                        <span>K</span>
                        <span>{p.pit.k}</span>
                        <span>128</span>
                        <span>118</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <details className="pdm-mock-details">
                <summary>Why this value?</summary>
                <p>
                  Static copy: replacement slot, surplus basis, and pool-to-slot ratio would appear
                  here in production. This block is collapsed by default in the target design.
                </p>
              </details>
              <details className="pdm-mock-details">
                <summary>Model notes</summary>
                <p>Static copy for preview only.</p>
              </details>
            </div>
          </div>
        </div>
        <footer className="pdm-mock-footer">
          <details className="pdm-mock-details">
            <summary>Disclaimer (mock)</summary>
            <p>No live valuations or MLB feeds — layout preview only.</p>
          </details>
        </footer>
      </div>
    </div>
  );
}
