import { useState } from "react";
import AuthNavbar from "../components/AuthNavbar";
import "./CommandCenter.css";

// ─────────────────────────────────────────────────────────────────────────────
// TODO: Replace all PLACEHOLDER_ values with real data from your backend/context
// ─────────────────────────────────────────────────────────────────────────────

// PLACEHOLDER_TEAMS: Replace with real league teams from MongoDB
const PLACEHOLDER_TEAMS = [
  { name: "My Team",  budget: 260, open: 17, maxBid: 244, ppSpot: 15.3 },
  { name: "Team B",   budget: 180, open: 17, maxBid: 164, ppSpot: 10.6 },
  { name: "Team C",   budget: 165, open: 17, maxBid: 149, ppSpot: 9.7  },
  { name: "Team D",   budget: 188, open: 17, maxBid: 172, ppSpot: 11.1 },
  { name: "Team E",   budget: 150, open: 17, maxBid: 134, ppSpot: 8.8  },
  { name: "Team F",   budget: 172, open: 17, maxBid: 156, ppSpot: 10.1 },
  { name: "Team G",   budget: 197, open: 17, maxBid: 181, ppSpot: 11.6 },
  { name: "Team H",   budget: 159, open: 17, maxBid: 143, ppSpot: 9.4  },
  { name: "Team I",   budget: 183, open: 17, maxBid: 167, ppSpot: 10.8 },
  { name: "Team J",   budget: 168, open: 17, maxBid: 152, ppSpot: 9.9  },
];

// PLACEHOLDER_STANDINGS: Replace with real standings from MongoDB
const PLACEHOLDER_STANDINGS = [
  { rank: 1,  name: "Team G",  w: 58, l: 27, pct: ".682", gb: "--"  },
  { rank: 2,  name: "My Team", w: 54, l: 31, pct: ".635", gb: "4.0" },
  { rank: 3,  name: "Team D",  w: 51, l: 34, pct: ".600", gb: "7.0" },
  { rank: 4,  name: "Team I",  w: 49, l: 36, pct: ".576", gb: "9.0" },
  { rank: 5,  name: "Team B",  w: 47, l: 38, pct: ".553", gb: "11.0"},
  { rank: 6,  name: "Team F",  w: 44, l: 41, pct: ".518", gb: "14.0"},
  { rank: 7,  name: "Team J",  w: 42, l: 43, pct: ".494", gb: "16.0"},
  { rank: 8,  name: "Team C",  w: 39, l: 46, pct: ".459", gb: "19.0"},
  { rank: 9,  name: "Team H",  w: 35, l: 50, pct: ".412", gb: "23.0"},
  { rank: 10, name: "Team E",  w: 28, l: 57, pct: ".329", gb: "30.0"},
];

// PLACEHOLDER_POSITION_BUDGET: Replace with real budget data from league/user context
const PLACEHOLDER_POSITION_BUDGET = [
  { pos: "SP",   open: 3, target: 45, spent: 38, delta: +7  },
  { pos: "RP",   open: 1, target: 18, spent: 22, delta: -4  },
  { pos: "C",    open: 1, target: 12, spent: 0,  delta: +12 },
  { pos: "1B",   open: 0, target: 30, spent: 34, delta: -4  },
  { pos: "SS",   open: 1, target: 28, spent: 21, delta: +7  },
  { pos: "3B",   open: 0, target: 25, spent: 28, delta: -3  },
  { pos: "OF",   open: 2, target: 40, spent: 52, delta: -12 },
  { pos: "UTIL", open: 1, target: 20, spent: 0,  delta: +20 },
];

// PLACEHOLDER_CATEGORY_PACE: Replace with real category tracking from MongoDB
const PLACEHOLDER_CATEGORY_PACE = {
  hitting:  [{ cat: "HR", pct: 82 }, { cat: "RBI", pct: 91 }, { cat: "R", pct: 88 }, { cat: "SB", pct: 104 }, { cat: "AVG", pct: 97 }],
  pitching: [{ cat: "W",  pct: 94 }, { cat: "K",   pct: 89 }, { cat: "ERA", pct: 101 }, { cat: "WHIP", pct: 98 }, { cat: "SV", pct: 73 }],
};

// PLACEHOLDER_ALERTS: Replace with real intelligence alerts from backend/AI service
const PLACEHOLDER_ALERTS = [
  {
    id: 1,
    type: "injury",
    icon: "⚠️",
    title: "Injury Update: Ronald Acuña Jr.",
    body: "Removed from game with knee soreness. Evaluated day-to-day.",
    link: "View in My Draft",
    time: "2m ago",
  },
  {
    id: 2,
    type: "structural",
    icon: "🔗",
    title: "Structural Signal: Closer Monopoly Detected",
    body: "Team X now controls 3 of top 8 projected saves sources. Market scarcity warning.",
    link: "View in League Overview",
    time: "15m ago",
  },
  {
    id: 3,
    type: "trade",
    icon: "📢",
    title: "Trade Alert: demotion — Camilo Doval.",
    body: "Removed from closer role by SF. Ryan Walker takes over source of saves.",
    link: "View in League Overview",
    time: "45m ago",
  },
  {
    id: 4,
    type: "structural",
    icon: "🔗",
    title: "Structural Alert: Budget Compression Alert",
    body: "League liquidity below threshold after consecutive premium nominations.",
    link: "View in League Overview",
    time: "1h ago",
  },
];

// PLACEHOLDER_SP_SUPPLY: Replace with real positional supply data
const PLACEHOLDER_SP_SUPPLY = [
  { tier: "Elite", remaining: 0,  avgPrice: "--"  },
  { tier: "Mid",   remaining: 0,  avgPrice: "--"  },
  { tier: "Low",   remaining: 8,  avgPrice: "$36" },
];

// PLACEHOLDER_MARKET_STATS: Replace with real market data per position
const PLACEHOLDER_MARKET_STATS = {
  position: "SP",
  avgWinningPrice: 30,
  projectedValue: 28,
  inflation: +7,
  remainingAtPos: 8,
  scarcityRank: { rank: 1, total: 8 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PaceBadge({ pct }: { pct: number }) {
  const color = pct >= 100 ? "#22c55e" : pct >= 85 ? "#f59e0b" : "#f87171";
  return <span className="pace-badge" style={{ color }}>{pct}%</span>;
}

function DeltaBadge({ delta }: { delta: number }) {
  const color = delta >= 0 ? "#22c55e" : "#f87171";
  return <span className="delta-badge" style={{ color }}>{delta >= 0 ? `+${delta}` : delta}</span>;
}

function LeftPanel({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) {
  return (
    <div className="cc-left">
      <div className="cc-tabs">
        {["Market", "Teams", "Standings"].map(t => (
          <button
            key={t}
            className={"cc-tab " + (activeTab === t ? "active" : "")}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Market" && (
        <div className="cc-panel-content">
          <div className="market-section-label">
            <span>{PLACEHOLDER_MARKET_STATS.position} MARKET</span>
            <span className="pos-chip">{PLACEHOLDER_MARKET_STATS.position}</span>
          </div>
          <div className="market-stat-row">
            <span className="msr-label">AVG WINNING PRICE</span>
            <span className="msr-value">${PLACEHOLDER_MARKET_STATS.avgWinningPrice}</span>
          </div>
          <div className="market-stat-row">
            <span className="msr-label">PROJECTED VALUE</span>
            <span className="msr-value green">${PLACEHOLDER_MARKET_STATS.projectedValue}</span>
          </div>
          <div className="market-stat-row">
            <span className="msr-label">INFLATION</span>
            <span className="msr-value yellow">+{PLACEHOLDER_MARKET_STATS.inflation}%</span>
          </div>
          <div className="market-stat-row">
            <span className="msr-label">REMAINING AT POS</span>
            <span className="msr-value">{PLACEHOLDER_MARKET_STATS.remainingAtPos}</span>
          </div>
          <div className="market-stat-row">
            <span className="msr-label">SCARCITY RANK</span>
            <span className="msr-value">{PLACEHOLDER_MARKET_STATS.scarcityRank.rank} <span className="msr-sub">/ {PLACEHOLDER_MARKET_STATS.scarcityRank.total}</span></span>
          </div>

          <div className="cc-divider" />

          <div className="market-section-label">TEAM LIQUIDITY</div>
          <table className="liquidity-table">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>$ LEFT</th>
                <th>OPEN</th>
                <th>MAX BID ↓</th>
                <th>$/SPOT</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_TEAMS.map(t => (
                <tr key={t.name} className={t.name === "My Team" ? "my-team-row" : ""}>
                  <td className="team-name-cell">{t.name}</td>
                  <td>${t.budget}</td>
                  <td>{t.open}</td>
                  <td className="green">${t.maxBid}</td>
                  <td>${t.ppSpot}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="cc-divider" />

          <div className="market-section-label">SP SUPPLY</div>
          <table className="supply-table">
            <thead>
              <tr><th>TIER</th><th>REMAINING</th><th>AVG $</th></tr>
            </thead>
            <tbody>
              {PLACEHOLDER_SP_SUPPLY.map(s => (
                <tr key={s.tier}>
                  <td className={"tier-cell tier-" + s.tier.toLowerCase()}>{s.tier}</td>
                  <td>{s.remaining}</td>
                  <td>{s.avgPrice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Teams" && (
        <div className="cc-panel-content">
          <table className="teams-table">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>LEFT</th>
                <th>OPEN</th>
                <th>MAX</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_TEAMS.map(t => (
                <tr key={t.name} className={t.name === "My Team" ? "my-team-row" : ""}>
                  <td className="team-name-cell">{t.name}</td>
                  <td>${t.budget}</td>
                  <td>{t.open}</td>
                  <td className="green">${t.maxBid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Standings" && (
        <div className="cc-panel-content">
          <table className="standings-table">
            <thead>
              <tr><th>#</th><th>TEAM</th><th>W</th><th>L</th><th>PCT</th><th>GB</th></tr>
            </thead>
            <tbody>
              {PLACEHOLDER_STANDINGS.map(s => (
                <tr key={s.rank} className={s.name === "My Team" ? "my-team-row" : ""}>
                  <td className="rank-cell">{s.rank}</td>
                  <td className="team-name-cell">{s.name}</td>
                  <td>{s.w}</td>
                  <td>{s.l}</td>
                  <td>{s.pct}</td>
                  <td className="gb-cell">{s.gb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuctionCenter() {
  // PLACEHOLDER_SELECTED_PLAYER: Replace with real selected player from auction state/socket
  const [selectedPlayer] = useState({
    name: "Freddy Peralta",
    position: "SP",
    team: "MIL",
    rank: 6,
    projValue: 28,
    adp: 30,
    mlbId: 669302,
    stats: { era: "3.79", k9: "11.4", whip: "1.15", ip: "168" },
    categoryImpact: [
      { cat: "W",   teamPace: 94,   withPlayer: 0,   delta: 0    },
      { cat: "K",   teamPace: 189,  withPlayer: 213, delta: +21  },
      { cat: "ERA", teamPace: 3.82, withPlayer: 3.79, delta: +0.03 },
      { cat: "SV",  teamPace: 0,    withPlayer: 12,  delta: +12  },
    ],
    marketAvg: 30,
    targetRange: { low: 29, high: 33 },
    notes: "Must get. Rarely injured. Reliable.",
  });

  const [currentBid, setCurrentBid] = useState("");
  // PLACEHOLDER_WINNER: Replace with real auction result from socket/backend
  const [wonBy, setWonBy] = useState("My Team");
  const [finalPrice, setFinalPrice] = useState("28");
  const [draftedToSlot, setDraftedToSlot] = useState("SP");
  const [statView, setStatView] = useState<"hitting" | "pitching">("pitching");
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertTab, setAlertTab] = useState("All Alerts");

  const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${selectedPlayer.mlbId}/headshot/67/current`;

  return (
    <div className="cc-center">
      {/* Search bar */}
      <div className="auction-search-bar">
        <span className="auction-search-icon">⊕</span>
        {/* PLACEHOLDER: Wire this to player search + socket nomination */}
        <input type="text" placeholder="Search player to load into auction..." className="auction-search-input" />
      </div>

      {/* Player card */}
      <div className="player-auction-card">
        <div className="pac-header">
          <span className="pac-pos-chip">{selectedPlayer.position}</span>
          <span className="pac-team-chip">{selectedPlayer.team}</span>
          <span className="pac-rank-chip">#{selectedPlayer.rank}</span>
          <div className="pac-name-row">
            <h1 className="pac-name">{selectedPlayer.name}</h1>
            <img
              src={headshotUrl}
              alt={selectedPlayer.name}
              className="pac-headshot"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="pac-meta">
            <span className="pac-proj">PROJ <strong className="green">${selectedPlayer.projValue}</strong></span>
            <span className="pac-adp">ADP <strong>${selectedPlayer.adp}</strong></span>
          </div>
        </div>

        {/* Notes */}
        <div className="pac-notes-label">PLAYER NOTES</div>
        {/* PLACEHOLDER: Wire notes to WatchlistEntry.notes from MongoDB */}
        <textarea className="pac-notes" defaultValue={selectedPlayer.notes} rows={3} />

        {/* Performance snapshot */}
        <div className="pac-snapshot-header">
          <span className="pac-section-label">PERFORMANCE SNAPSHOT</span>
          <div className="stat-view-toggle">
            <button className={"svt-btn " + (statView === "hitting" ? "active" : "")} onClick={() => setStatView("hitting")}>Hitting</button>
            <button className={"svt-btn " + (statView === "pitching" ? "active" : "")} onClick={() => setStatView("pitching")}>Pitching</button>
          </div>
        </div>

        {statView === "pitching" ? (
          <div className="pac-stat-boxes">
            <div className="stat-box"><div className="sb-label">ERA</div><div className="sb-val">{selectedPlayer.stats.era}</div></div>
            <div className="stat-box"><div className="sb-label">K/9</div><div className="sb-val">{selectedPlayer.stats.k9}</div></div>
            <div className="stat-box"><div className="sb-label">WHIP</div><div className="sb-val">{selectedPlayer.stats.whip}</div></div>
            <div className="stat-box"><div className="sb-label">IP</div><div className="sb-val">{selectedPlayer.stats.ip}</div></div>
          </div>
        ) : (
          <div className="pac-stat-boxes">
            {/* PLACEHOLDER: Replace with real batting stats */}
            <div className="stat-box"><div className="sb-label">AVG</div><div className="sb-val">.---</div></div>
            <div className="stat-box"><div className="sb-label">HR</div><div className="sb-val">--</div></div>
            <div className="stat-box"><div className="sb-label">RBI</div><div className="sb-val">--</div></div>
            <div className="stat-box"><div className="sb-label">SB</div><div className="sb-val">--</div></div>
          </div>
        )}

        {/* Category impact */}
        <div className="pac-section-label" style={{ marginTop: "1rem" }}>CATEGORY IMPACT</div>
        <table className="category-impact-table">
          <thead><tr><th>CAT</th><th>TEAM PACE</th><th>WITH PLAYER</th><th>DELTA</th></tr></thead>
          <tbody>
            {/* PLACEHOLDER: Replace with real category impact calculated from team roster + player stats */}
            {selectedPlayer.categoryImpact.map(row => (
              <tr key={row.cat}>
                <td className="ci-cat">{row.cat}</td>
                <td>{row.teamPace}</td>
                <td>{row.withPlayer}</td>
                <td><DeltaBadge delta={row.delta} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Live price */}
        <div className="pac-section-label" style={{ marginTop: "1rem" }}>LIVE PRICE</div>
        <div className="live-price-row">
          <div className="lp-block">
            <div className="lp-label">CURRENT HIGH BID</div>
            {/* PLACEHOLDER: Replace with real-time bid from Socket.io */}
            <div className="lp-val bid">$—</div>
          </div>
          <div className="lp-block">
            <div className="lp-label">MARKET AVG</div>
            <div className="lp-val">${selectedPlayer.marketAvg}</div>
          </div>
          <div className="lp-block">
            <div className="lp-label">TARGET RANGE</div>
            <div className="lp-val green">${selectedPlayer.targetRange.low}–${selectedPlayer.targetRange.high}</div>
          </div>
        </div>

        <div className="bid-row">
          {/* PLACEHOLDER: Wire to Socket.io bid submission */}
          <input
            type="text"
            className="bid-input"
            placeholder="$ Current price..."
            value={currentBid}
            onChange={e => setCurrentBid(e.target.value)}
          />
          <button className="bid-star-btn">☆</button>
        </div>

        {/* Log result */}
        <div className="pac-section-label" style={{ marginTop: "1rem" }}>LOG RESULT</div>
        <div className="log-result-grid">
          <div className="log-field">
            <label className="log-label">WON BY</label>
            {/* PLACEHOLDER: Replace options with real league team names */}
            <select className="log-select" value={wonBy} onChange={e => setWonBy(e.target.value)}>
              {PLACEHOLDER_TEAMS.map(t => <option key={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div className="log-field">
            <label className="log-label">FINAL PRICE</label>
            <div className="log-price-input-wrap">
              <span className="log-dollar">$</span>
              {/* PLACEHOLDER: Wire to socket/backend to record DraftPick in MongoDB */}
              <input type="text" className="log-price-input" value={finalPrice} onChange={e => setFinalPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="log-slot-field">
          <label className="log-label">DRAFTED TO SLOT</label>
          <select className="log-select full" value={draftedToSlot} onChange={e => setDraftedToSlot(e.target.value)}>
            {["SP", "RP", "C", "1B", "2B", "SS", "3B", "OF", "UTIL", "Bench"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <button className="log-result-btn">Log Result</button>

        <div className="pac-nav-arrows">
          <button className="pac-arrow">‹</button>
          <button className="pac-arrow">›</button>
        </div>
      </div>

      {/* Alerts overlay */}
      {showAlerts && (
        <div className="alerts-overlay">
          <div className="alerts-panel">
            <div className="alerts-header">
              <span className="alerts-title">Intelligence Alerts</span>
              <button className="alerts-close" onClick={() => setShowAlerts(false)}>✕</button>
            </div>
            <div className="alerts-tabs">
              {["All Alerts", "External Baseball", "Structural Signals"].map(t => (
                <button key={t} className={"alert-tab " + (alertTab === t ? "active" : "")} onClick={() => setAlertTab(t)}>{t}</button>
              ))}
            </div>
            <div className="alerts-list">
              {/* PLACEHOLDER: Replace with real alerts from AI/news service */}
              {PLACEHOLDER_ALERTS.map(a => (
                <div key={a.id} className={"alert-item alert-" + a.type}>
                  <div className="alert-icon">{a.icon}</div>
                  <div className="alert-body">
                    <div className="alert-title-text">{a.title}</div>
                    <div className="alert-desc">{a.body}</div>
                    <div className="alert-link">{a.link}</div>
                  </div>
                  <div className="alert-time">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alerts bell button — floats over center panel */}
      <button className="alerts-bell-btn" onClick={() => setShowAlerts(v => !v)}>
        🔔 <span className="bell-badge">{PLACEHOLDER_ALERTS.length}</span>
      </button>
    </div>
  );
}

function RightPanel() {
  return (
    <div className="cc-right">
      {/* Budget summary */}
      <div className="rp-section-label">YOUR BUDGET</div>
      <div className="budget-grid">
        {/* PLACEHOLDER: Replace with real user budget from league/user context */}
        <div className="budget-card">
          <div className="bc-label">BUDGET REMAINING</div>
          <div className="bc-val green">$260</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">OPEN SPOTS</div>
          <div className="bc-val">17</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">MAX BID</div>
          <div className="bc-val green">$244</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">$ PER SPOT</div>
          <div className="bc-val">$15.3</div>
        </div>
      </div>
      {/* PLACEHOLDER: Replace filled/spent with real roster data */}
      <div className="budget-progress-row">
        <span className="bp-text">0/17 filled</span>
        <span className="bp-text">$0 spent</span>
      </div>

      <div className="cc-divider" />

      {/* Position budget plan */}
      <div className="rp-section-label">POSITION BUDGET PLAN</div>
      <table className="pos-budget-table">
        <thead>
          <tr><th>POS</th><th>OPEN</th><th>TARGET</th><th>SPENT</th><th>Δ</th></tr>
        </thead>
        <tbody>
          {PLACEHOLDER_POSITION_BUDGET.map(p => (
            <tr key={p.pos}>
              <td className="pb-pos">{p.pos}</td>
              <td className={p.open > 0 ? "green" : "dim"}>{p.open}</td>
              <td>${p.target}</td>
              <td>${p.spent}</td>
              <td><DeltaBadge delta={p.delta} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cc-divider" />

      {/* Category pace */}
      <div className="rp-section-label">CATEGORY PACE</div>
      <div className="cat-pace-section">
        <div className="cat-pace-group-label">HITTING</div>
        <div className="cat-pace-row">
          {PLACEHOLDER_CATEGORY_PACE.hitting.map(c => (
            <div key={c.cat} className="cat-pace-item">
              <div className="cp-label">{c.cat}</div>
              <PaceBadge pct={c.pct} />
            </div>
          ))}
        </div>
        <div className="cat-pace-group-label" style={{ marginTop: "0.6rem" }}>PITCHING</div>
        <div className="cat-pace-row">
          {PLACEHOLDER_CATEGORY_PACE.pitching.map(c => (
            <div key={c.cat} className="cat-pace-item">
              <div className="cp-label">{c.cat}</div>
              <PaceBadge pct={c.pct} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [activeTab, setActiveTab] = useState("Market");

  return (
    <div className="cc-page">
      <AuthNavbar />
      <div className="cc-layout">
        <LeftPanel activeTab={activeTab} setActiveTab={setActiveTab} />
        <AuctionCenter />
        <RightPanel />
      </div>
    </div>
  );
}