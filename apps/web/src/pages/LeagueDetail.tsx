import { ArrowLeft, Calendar, DollarSign, Users, BarChart3, Bell, Star } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import "./LeagueDetail.css";

const mockLeagueMap: Record<string, any> = {
  "1": {
    id: "1",
    name: "Fantasy Masters 2026",
    status: "Pre-Draft",
    teams: 12,
    budget: 260,
    draftDate: "March 15, 2026",
    format: "Rotisserie",
  },
  "2": {
    id: "2",
    name: "Office League",
    status: "In Progress",
    teams: 10,
    budget: 200,
    draftDate: "March 1, 2026",
    format: "Head-to-Head",
  },
};

const quickLinks = [
  {
    title: "Research Players",
    description: "Search players, compare values, and build your watchlist.",
    icon: BarChart3,
  },
  {
    title: "My Draft",
    description: "Track budget, category balance, and strategy targets.",
    icon: Star,
  },
  {
    title: "Command Center",
    description: "Run the live draft experience and record picks in real time.",
    icon: Bell,
  },
];

export default function LeagueDetail() {
  const navigate = useNavigate();
  const { leagueId } = useParams();

  const league =
    (leagueId && mockLeagueMap[leagueId]) || {
      id: leagueId ?? "unknown",
      name: "League",
      status: "Pre-Draft",
      teams: 12,
      budget: 260,
      draftDate: "TBD",
      format: "Rotisserie",
    };

  return (
    <div className="league-detail-page">
      <header className="league-detail-topbar">
        <div className="league-detail-brand">
          <span className="league-detail-brand-icon">⚡</span>
          <span>DRAFTROOM</span>
        </div>
        <div className="league-detail-profile">◦</div>
      </header>

      <main className="league-detail-main">
        <button className="league-detail-back" onClick={() => navigate("/leagues")}>
          <ArrowLeft size={16} />
          <span>Back to Leagues</span>
        </button>

        <section className="league-detail-hero">
          <div>
            <div className="league-detail-status">{league.status}</div>
            <h1>{league.name}</h1>
            <p>{league.format} fantasy baseball league overview.</p>
          </div>

          <div className="league-detail-meta-grid">
            <div className="league-detail-meta-card">
              <Users size={16} />
              <span>{league.teams} Teams</span>
            </div>
            <div className="league-detail-meta-card">
              <DollarSign size={16} />
              <span>${league.budget} Budget</span>
            </div>
            <div className="league-detail-meta-card">
              <Calendar size={16} />
              <span>{league.draftDate}</span>
            </div>
          </div>
        </section>

        <section className="league-detail-card">
          <div className="league-detail-section-title">LEAGUE HUB</div>

          <div className="league-detail-links">
            {quickLinks.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.title}
                  className="league-detail-link-card"
                  onClick={() => console.log("Navigate to:", item.title)}
                >
                  <div className="league-detail-link-icon">
                    <Icon size={18} />
                  </div>

                  <div className="league-detail-link-copy">
                    <div className="league-detail-link-title">{item.title}</div>
                    <div className="league-detail-link-desc">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="league-detail-card">
          <div className="league-detail-section-title">CURRENT SNAPSHOT</div>

          <div className="league-detail-snapshot-grid">
            <div className="league-detail-snapshot-box">
              <div className="league-detail-snapshot-label">Draft Status</div>
              <div className="league-detail-snapshot-value">{league.status}</div>
            </div>

            <div className="league-detail-snapshot-box">
              <div className="league-detail-snapshot-label">Player Pool</div>
              <div className="league-detail-snapshot-value">Mixed MLB</div>
            </div>

            <div className="league-detail-snapshot-box">
              <div className="league-detail-snapshot-label">Scoring</div>
              <div className="league-detail-snapshot-value">5x5 Roto</div>
            </div>

            <div className="league-detail-snapshot-box">
              <div className="league-detail-snapshot-label">Keepers</div>
              <div className="league-detail-snapshot-value">Enabled</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}