import { ArrowLeft, Search, Users, Trophy } from "lucide-react";
import { useNavigate } from "react-router";
import "./JoinLeague.css";

const publicLeagues = [
  {
    id: "1",
    name: "Fantasy Masters 2026",
    commissioner: "Sami",
    teamsFilled: 8,
    totalTeams: 12,
    budget: 260,
    format: "Rotisserie",
  },
  {
    id: "2",
    name: "Office League",
    commissioner: "Ammar",
    teamsFilled: 10,
    totalTeams: 10,
    budget: 200,
    format: "Head-to-Head",
  },
  {
    id: "3",
    name: "Late Night Auction",
    commissioner: "Kai",
    teamsFilled: 6,
    totalTeams: 12,
    budget: 300,
    format: "Rotisserie",
  },
];

export default function JoinLeague() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/leagues");
  };

  const handleJoin = (leagueId: string) => {
    console.log("Joining league:", leagueId);
    navigate("/leagues");
  };

  return (
    <div className="join-league-page">
      <header className="join-league-topbar">
        <div className="join-league-brand">
          <span className="join-league-brand-icon">⚡</span>
          <span>DRAFTROOM</span>
        </div>
        <div className="join-league-profile">◦</div>
      </header>

      <main className="join-league-main">
        <button className="join-league-back" onClick={handleBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="join-league-header">
          <h1>Join League</h1>
          <p>Enter a private invite code or browse available public leagues.</p>
        </div>

        <section className="join-league-card">
          <div className="join-league-section-title">PRIVATE INVITE</div>

          <div className="join-league-invite-row">
            <div className="join-league-invite-input">
              <Search size={16} />
              <input placeholder="Enter invite code..." />
            </div>
            <button className="join-league-primary-btn">Join with Code</button>
          </div>
        </section>

        <section className="join-league-card">
          <div className="join-league-section-title">PUBLIC LEAGUES</div>

          <div className="join-league-list">
            {publicLeagues.map((league) => (
              <div key={league.id} className="join-league-row">
                <div className="join-league-row-left">
                  <div className="join-league-avatar">
                    <Trophy size={16} />
                  </div>

                  <div>
                    <div className="join-league-name">{league.name}</div>
                    <div className="join-league-meta">
                      Commissioner: {league.commissioner} • {league.format}
                    </div>
                  </div>
                </div>

                <div className="join-league-row-stats">
                  <div className="join-league-stat">
                    <Users size={15} />
                    <span>
                      {league.teamsFilled}/{league.totalTeams}
                    </span>
                  </div>
                  <div className="join-league-budget">${league.budget}</div>
                  <button
                    className="join-league-secondary-btn"
                    onClick={() => handleJoin(league.id)}
                  >
                    Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}