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
import { useMemo, useState } from "react";
import {
  groupLeaguesByFamily,
  leagueCurrentSeasonSummary,
  formatLeagueDraftStatusLabel,
} from "../domain/leagueSeasonGroups";

export default function Leagues() {
  usePageTitle("My Leagues");
  const navigate = useNavigate();
  const { allLeagues: leagues, loading } = useLeague();
  const [selectedSeason, setSelectedSeason] = useState<number | "all">("all");

  const seasons = useMemo(() => {
    const s = new Set<number>();
    for (const l of leagues) {
      const year = l.seasonYear ?? new Date(l.createdAt).getFullYear();
      s.add(year);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [leagues]);

  const filteredLeagues = useMemo(() => {
    if (selectedSeason === "all") return leagues;
    return leagues.filter(
      (l) =>
        (l.seasonYear ?? new Date(l.createdAt).getFullYear()) === selectedSeason,
    );
  }, [leagues, selectedSeason]);

  const familyGroups = groupLeaguesByFamily(filteredLeagues);

  const handleCreateLeague = () => navigate("/leagues/create");
  const handleLeagueClick = (leagueId: string) =>
    navigate(`/leagues/${leagueId}/research`);

  const handleSettingsClick = (e: React.MouseEvent, leagueId: string) => {
    e.stopPropagation();
    navigate(`/leagues/${leagueId}/settings`);
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
          <div>
            <div className="leagues-filter">
              <label htmlFor="seasonFilter">Season:</label>
              <select
                id="seasonFilter"
                value={selectedSeason}
                onChange={(e) =>
                  setSelectedSeason(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
              >
                <option value="all">All seasons</option>
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    Season {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="leagues-families">
              {familyGroups.map((group) => {
                const [head, ...older] = group.seasons;
                const current = head!.league;
                return (
                  <article
                    key={group.leagueFamilyId}
                    className="leagues-family-card theme-surface"
                  >
                    <div
                      className="leagues-family-primary"
                      onClick={() => handleLeagueClick(current.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleLeagueClick(current.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="leagues-family-primary-header">
                        <h2 className="leagues-family-name">{group.displayName}</h2>
                        <div
                          className="league-card-header-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="league-card-settings-btn"
                            title="League settings"
                            onClick={(e) => handleSettingsClick(e, current.id)}
                          >
                            <Settings size={15} />
                          </button>
                        </div>
                      </div>
                      <p className="leagues-family-summary">
                        {leagueCurrentSeasonSummary(current)}
                      </p>
                      <div className="league-card-meta leagues-family-primary-meta">
                        <div className="league-meta-item">
                          <Users />
                          <span>{current.teams} Teams</span>
                        </div>
                        <div className="league-meta-item">
                          <DollarSign />
                          <span>${current.budget} Budget</span>
                        </div>
                        {current.draftDate && (
                          <div className="league-meta-item">
                            <Calendar />
                            <span>
                              {new Date(current.draftDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        <div className="league-meta-item">
                          <span
                            className={`league-card-status status-${current.draftStatus}`}
                          >
                            {formatLeagueDraftStatusLabel(current.draftStatus)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {older.length > 0 ? (
                      <ul
                        className="leagues-archive-list"
                        aria-label="Older seasons"
                      >
                        {older.map(({ league, seasonLabel }) => (
                          <li key={league.id} className="leagues-archive-row">
                            <button
                              type="button"
                              className="leagues-archive-main"
                              onClick={() => handleLeagueClick(league.id)}
                            >
                              <span className="leagues-archive-year">
                                {seasonLabel}
                              </span>
                              <span
                                className={`league-card-status status-${league.draftStatus}`}
                              >
                                {formatLeagueDraftStatusLabel(league.draftStatus)}
                              </span>
                              <span className="leagues-archive-meta">
                                {league.teams} teams · ${league.budget}
                              </span>
                            </button>
                            <div className="leagues-archive-actions">
                              <button
                                type="button"
                                className="league-card-settings-btn"
                                title="League settings"
                                onClick={(e) => handleSettingsClick(e, league.id)}
                              >
                                <Settings size={15} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                );
              })}
            </div>
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
