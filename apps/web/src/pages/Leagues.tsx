import { Plus, Users, Calendar, DollarSign, Trophy } from "lucide-react";
import AuthNavbar from "../components/AuthNavbar";
import "./Leagues.css";
import { useNavigate } from "react-router";


export default function Leagues() {
  const navigate = useNavigate();
  // Mock data - replace with real API calls later
  const leagues = [
    {
      id: "1",
      name: "Fantasy Masters 2026",
      status: "pre-draft",
      teams: 12,
      budget: 260,
      draftDate: "March 15, 2026",
    },
    {
      id: "2",
      name: "Office League",
      status: "in-progress",
      teams: 10,
      budget: 200,
      draftDate: "March 1, 2026",
    },
  ];

  const handleCreateLeague = () => {
    navigate("/leagues/create");
    console.log("Create league clicked");
  };

  const handleJoinLeague = () => {
    navigate("/leagues/join");
    console.log("Join league clicked");
  };

  const handleLeagueClick = (leagueId: string) => {
    navigate(`/leagues/${leagueId}`);
    console.log("League clicked:", leagueId);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pre-draft":
        return "Pre-Draft";
      case "in-progress":
        return "In Progress";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  return (
    <div className="leagues-page">
      <AuthNavbar />
      <div className="leagues-container">
        <div className="leagues-header">
          <h1 className="leagues-title">My Leagues</h1>
          <p className="leagues-subtitle">
            Join or create a league to start drafting your championship team
          </p>
        </div>

        <div className="leagues-actions">
          <button className="btn-create-league" onClick={handleCreateLeague}>
            <Plus size={18} />
            Create League
          </button>
          <button className="btn-join-league" onClick={handleJoinLeague}>
            <Users size={18} />
            Join League
          </button>
        </div>

        {leagues.length > 0 ? (
          <div className="leagues-grid">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="league-card"
                onClick={() => handleLeagueClick(league.id)}
              >
                <div className="league-card-header">
                  <div className="league-card-info">
                    <h3 className="league-card-title">{league.name}</h3>
                  </div>
                  <span className={`league-card-status status-${league.status}`}>
                    {getStatusLabel(league.status)}
                  </span>
                </div>
                <div className="league-card-meta">
                  <div className="league-meta-item">
                    <Users />
                    <span>{league.teams} Teams</span>
                  </div>
                  <div className="league-meta-item">
                    <DollarSign />
                    <span>${league.budget} Budget</span>
                  </div>
                  <div className="league-meta-item">
                    <Calendar />
                    <span>{league.draftDate}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Trophy size={32} />
            </div>
            <h2 className="empty-state-title">No Leagues Yet</h2>
            <p className="empty-state-text">
              Create or join your first league to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}