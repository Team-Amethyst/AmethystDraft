import {
  Plus,
  Users,
  Calendar,
  DollarSign,
  Trophy,
  Settings,
} from "lucide-react";
import AuthNavbar from "../components/AuthNavbar";
import "./Leagues.css";
import { useNavigate } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";

export default function Leagues() {
  usePageTitle("My Leagues");
  const navigate = useNavigate();
  const { allLeagues: leagues, loading } = useLeague();

  const handleCreateLeague = () => navigate("/leagues/create");
  const handleLeagueClick = (leagueId: string) =>
    navigate(`/leagues/${leagueId}/research`);

  const handleSettingsClick = (e: React.MouseEvent, leagueId: string) => {
    e.stopPropagation();
    navigate(`/leagues/${leagueId}/settings`);
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
        </div>

        {loading ? (
          <div className="empty-state">
            <p className="empty-state-text">Loading leagues…</p>
          </div>
        ) : leagues.length > 0 ? (
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
                  <div className="league-card-header-right">
                    <span
                      className={`league-card-status status-${league.draftStatus}`}
                    >
                      {getStatusLabel(league.draftStatus)}
                    </span>
                    <button
                      className="league-card-settings-btn"
                      title="League settings"
                      onClick={(e) => handleSettingsClick(e, league.id)}
                    >
                      <Settings size={15} />
                    </button>
                  </div>
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
                  {league.draftDate && (
                    <div className="league-meta-item">
                      <Calendar />
                      <span>
                        {new Date(league.draftDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
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
              Create your first league to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
