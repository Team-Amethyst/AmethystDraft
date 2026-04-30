import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { Database, BarChart3, Layers, UserPlus, Star } from "lucide-react";
import PlayerTable from "../components/PlayerTable";
import type { Player } from "../types/player";
import {
  getDepthChartCached,
  getPlayers,
  getPlayersCached,
  getTeamDepthChart,
  type DepthChartPlayerRow,
  type DepthChartPosition,
  type DepthChartResponse,
} from "../api/players";
import { getValuation } from "../api/engine";
import { getRoster, getRosterCached, type RosterEntry } from "../api/roster";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import {
  hasPitcherEligibility,
  normalizePlayerPositions,
} from "../utils/eligibility";
import "./Research.css";
import AddPlayerModal from "../components/AddPlayerModal";
import PlayerDetailModal from "../components/PlayerDetailModal";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import {
  mergeCatalogPlayersWithValuations,
  type ValuationShape,
} from "../utils/valuation";
import { resolveUserTeamId } from "../utils/team";

type ResearchView = "player-database" | "tiers" | "depth-charts";

const DEPTH_POSITIONS: DepthChartPosition[] = [
  "SP",
  "RP",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
];

const MLB_TEAMS = [
  { id: 108, abbr: "LAA", name: "Los Angeles Angels" },
  { id: 109, abbr: "AZ", name: "Arizona Diamondbacks" },
  { id: 110, abbr: "BAL", name: "Baltimore Orioles" },
  { id: 111, abbr: "BOS", name: "Boston Red Sox" },
  { id: 112, abbr: "CHC", name: "Chicago Cubs" },
  { id: 113, abbr: "CIN", name: "Cincinnati Reds" },
  { id: 114, abbr: "CLE", name: "Cleveland Guardians" },
  { id: 115, abbr: "COL", name: "Colorado Rockies" },
  { id: 116, abbr: "DET", name: "Detroit Tigers" },
  { id: 117, abbr: "HOU", name: "Houston Astros" },
  { id: 118, abbr: "KC", name: "Kansas City Royals" },
  { id: 119, abbr: "LAD", name: "Los Angeles Dodgers" },
  { id: 120, abbr: "WSH", name: "Washington Nationals" },
  { id: 121, abbr: "NYM", name: "New York Mets" },
  { id: 133, abbr: "ATH", name: "Athletics" },
  { id: 134, abbr: "PIT", name: "Pittsburgh Pirates" },
  { id: 135, abbr: "SD", name: "San Diego Padres" },
  { id: 136, abbr: "SEA", name: "Seattle Mariners" },
  { id: 137, abbr: "SF", name: "San Francisco Giants" },
  { id: 138, abbr: "STL", name: "St. Louis Cardinals" },
  { id: 139, abbr: "TB", name: "Tampa Bay Rays" },
  { id: 140, abbr: "TEX", name: "Texas Rangers" },
  { id: 141, abbr: "TOR", name: "Toronto Blue Jays" },
  { id: 142, abbr: "MIN", name: "Minnesota Twins" },
  { id: 143, abbr: "PHI", name: "Philadelphia Phillies" },
  { id: 144, abbr: "ATL", name: "Atlanta Braves" },
  { id: 145, abbr: "CWS", name: "Chicago White Sox" },
  { id: 146, abbr: "MIA", name: "Miami Marlins" },
  { id: 147, abbr: "NYY", name: "New York Yankees" },
  { id: 158, abbr: "MIL", name: "Milwaukee Brewers" },
];

export default function Research() {
  usePageTitle("Research");

  const { customPlayers, addCustomPlayer, isCustomPlayer } = useCustomPlayers();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState<Player | null>(null);

  const { id: leagueId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setSelectedPlayer } = useSelectedPlayer();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const { getNote, setNote } = usePlayerNotes();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

  const [selectedView, setSelectedView] = useState<ResearchView>("player-database");
  const [selectedDepthTeamId, setSelectedDepthTeamId] = useState(147);
  const [depthChartData, setDepthChartData] = useState<DepthChartResponse | null>(
    () => getDepthChartCached(147),
  );
  const [isLoadingDepthChart, setIsLoadingDepthChart] = useState(
    () => getDepthChartCached(147) === null,
  );
  const [depthChartError, setDepthChartError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState(() => {
    try {
      return localStorage.getItem("amethyst-research-position") ?? "all";
    } catch {
      return "all";
    }
  });
  const [statBasis, setStatBasis] = useState<
    "projections" | "last-year" | "3-year-avg"
  >(() => {
    try {
      return (
        (localStorage.getItem("amethyst-research-statbasis") as
          | "projections"
          | "last-year"
          | "3-year-avg") ?? "last-year"
      );
    } catch {
      return "last-year";
    }
  });

  const [players, setPlayers] = useState<Player[]>(
    () => getPlayersCached("adp") ?? [],
  );
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(
    () => getPlayersCached("adp") === null,
  );
  const [playersError, setPlayersError] = useState("");
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationShape>
  >(() => new Map());

  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>(
    () => getRosterCached(leagueId ?? "") ?? [],
  );

  const draftedIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.externalPlayerId)),
    [rosterEntries],
  );

  const draftedByTeam = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of rosterEntries) {
      const idx = e.teamId
        ? parseInt(e.teamId.replace("team_", ""), 10) - 1
        : -1;
      const name =
        (idx >= 0 ? league?.teamNames[idx] : undefined) ?? e.teamId ?? "";
      if (name) map.set(e.externalPlayerId, name);
    }
    return map;
  }, [rosterEntries, league?.teamNames]);

  const draftedContractByPlayerId = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of rosterEntries) {
      if (e.keeperContract && e.keeperContract.trim() !== "") {
        map.set(e.externalPlayerId, e.keeperContract.trim());
      }
    }
    return map;
  }, [rosterEntries]);

  const depthTotalSlots = DEPTH_POSITIONS.length * 3;
  const depthAssignedCount = useMemo(() => {
    if (!depthChartData) return 0;
    return DEPTH_POSITIONS.reduce(
      (total, position) => total + (depthChartData.positions[position]?.length ?? 0),
      0,
    );
  }, [depthChartData]);

  const customPlayerIds = useMemo(
    () => new Set(customPlayers.map((p) => p.id)),
    [customPlayers],
  );

  useEffect(() => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries);
  }, [leagueId, token]);

  useEffect(() => {
    try {
      localStorage.setItem("amethyst-research-position", positionFilter);
    } catch { /* noop */ }
  }, [positionFilter]);

  useEffect(() => {
    try {
      localStorage.setItem("amethyst-research-statbasis", statBasis);
    } catch { /* noop */ }
  }, [statBasis]);

  useEffect(() => {
    const loadPlayers = async () => {
      const cached = getPlayersCached(
        "adp",
        league?.posEligibilityThreshold,
        league?.playerPool,
      );
      if (!cached) setIsLoadingPlayers(true);
      setPlayersError("");

      try {
        const playersFromApi = await getPlayers(
          "adp",
          league?.posEligibilityThreshold,
          league?.playerPool,
        );
        setPlayers(playersFromApi);
      } catch (err) {
        setPlayersError(
          err instanceof Error ? err.message : "Failed to load players",
        );
      } finally {
        setIsLoadingPlayers(false);
      }
    };

    if (selectedView === "player-database") {
      void loadPlayers();
    }
  }, [selectedView, league?.posEligibilityThreshold, league?.playerPool]);

  useEffect(() => {
    if (!token || !leagueId || players.length === 0) {
      setValuationsByPlayerId(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const userTeamId = resolveUserTeamId(league, user?.id);
        const res = await getValuation(leagueId, token, userTeamId);
        const merged = new Map<string, ValuationShape>();
        for (const row of res.valuations) {
          if (customPlayerIds.has(row.player_id)) continue;
          merged.set(row.player_id, row);
        }
        if (!cancelled) setValuationsByPlayerId(merged);
      } catch {
        if (!cancelled) setValuationsByPlayerId(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, leagueId, players.length, customPlayerIds, league, user?.id]);

  const loadDepthChart = useCallback(async (teamId: number, forceRefresh = false) => {
    const cached = getDepthChartCached(teamId);
    if (!cached || forceRefresh) {
      setIsLoadingDepthChart(true);
    }
    setDepthChartError("");

    try {
      const depth = await getTeamDepthChart(teamId, undefined, forceRefresh);
      setDepthChartData(depth);
    } catch (err) {
      setDepthChartError(
        err instanceof Error ? err.message : "Failed to load depth chart",
      );
    } finally {
      setIsLoadingDepthChart(false);
    }
  }, []);

  useEffect(() => {
    if (selectedView !== "depth-charts") return;
    void loadDepthChart(selectedDepthTeamId);
  }, [selectedDepthTeamId, selectedView, loadDepthChart]);

  // Merge MLB API players with custom players — custom players appear at the top
  const allPlayers = useMemo(
    () => [...customPlayers, ...players],
    [players, customPlayers],
  );

  const filteredPlayers = useMemo(() => {
    return allPlayers.filter((player) => {
      const playerName = player.name?.toLowerCase() ?? "";
      const matchesSearch = playerName.includes(searchQuery.toLowerCase());
      const matchesPosition =
        positionFilter === "all" ||
        (() => {
          const allPos = normalizePlayerPositions(
            player.positions,
            player.position,
          );
          if (positionFilter === "P") {
            return hasPitcherEligibility(player.positions, player.position);
          }
          if (positionFilter === "OF") {
            return allPos.includes("OF");
          }
          return allPos.includes(positionFilter);
        })();
      return matchesSearch && matchesPosition;
    });
  }, [allPlayers, searchQuery, positionFilter]);

  const mergedPlayers = useMemo(
    () => mergeCatalogPlayersWithValuations(filteredPlayers, valuationsByPlayerId),
    [filteredPlayers, valuationsByPlayerId],
  );

  const handlePlayerClick = (player: Player) => {
    setSelectedModalPlayer(player);
  };

  const handleMoveToCommandCenter = (player: Player) => {
    setSelectedPlayer(player);
    setSelectedModalPlayer(null);
    void navigate(`/leagues/${leagueId ?? ""}/command-center`);
  };

  const resolveDepthPlayer = useCallback(async (slot: DepthChartPlayerRow): Promise<Player | null> => {
    const fromLoaded = allPlayers.find(
      (player) => player.mlbId === slot.playerId || player.id === String(slot.playerId),
    );
    if (fromLoaded) return fromLoaded;

    const playersFromApi = await getPlayers(
      "adp",
      league?.posEligibilityThreshold,
      league?.playerPool,
    );
    setPlayers(playersFromApi);

    return (
      playersFromApi.find(
        (player) => player.mlbId === slot.playerId || player.id === String(slot.playerId),
      ) ?? null
    );
  }, [allPlayers, league?.playerPool, league?.posEligibilityThreshold]);

  const handleDepthPlayerClick = useCallback(async (slot: DepthChartPlayerRow) => {
    setDepthChartError("");

    try {
      const matched = await resolveDepthPlayer(slot);
      if (matched) {
        handlePlayerClick(matched);
        return;
      }

      setDepthChartError(`Could not open ${slot.playerName}. Player record was not found in catalog data.`);
    } catch (err) {
      setDepthChartError(
        err instanceof Error
          ? err.message
          : "Failed to load player details for command center navigation",
      );
    }
  }, [handlePlayerClick, resolveDepthPlayer]);

  const handleDepthStarToggle = useCallback(async (slot: DepthChartPlayerRow) => {
    setDepthChartError("");
    try {
      const matched = await resolveDepthPlayer(slot);
      if (!matched) {
        setDepthChartError(`Could not star ${slot.playerName}. Player record was not found in catalog data.`);
        return;
      }

      if (isInWatchlist(matched.id)) {
        removeFromWatchlist(matched.id);
      } else {
        addToWatchlist(matched);
      }
    } catch (err) {
      setDepthChartError(
        err instanceof Error
          ? err.message
          : "Failed to update watchlist from depth chart",
      );
    }
  }, [addToWatchlist, isInWatchlist, removeFromWatchlist, resolveDepthPlayer]);

  const navigationItems: Array<{
    id: ResearchView;
    label: string;
    icon: typeof Database;
  }> = [
    { id: "player-database", label: "Players", icon: Database },
    { id: "tiers",           label: "Tiers",   icon: BarChart3 },
    { id: "depth-charts",    label: "Depth Charts", icon: Layers },
  ];

  return (
    <div className="research-page">
      <div className="research-layout">

        {/* Top Navigation Tabs + Add Player button */}
        <div className="research-top-nav">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-tab ${selectedView === item.id ? "active" : ""}`}
                onClick={() => setSelectedView(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Add Player trigger — only shown on the player database view */}
          {selectedView === "player-database" && (
            <button
              className="nav-tab add-player-btn"
              onClick={() => setShowAddModal(true)}
              title="Add a player not found in the MLB data source"
            >
              <UserPlus size={16} />
              <span>Add Player</span>
            </button>
          )}
        </div>

        <div className="research-content">
          {selectedView === "player-database" && (
            <>
              {playersError && <p className="research-error">{playersError}</p>}
              {isLoadingPlayers ? (
                <div className="coming-soon">
                  <h2>Loading Players</h2>
                  <p>Fetching player data from MLB Stats API...</p>
                </div>
              ) : (
                <PlayerTable
                  players={mergedPlayers}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  positionFilter={positionFilter}
                  onPositionChange={setPositionFilter}
                  statBasis={statBasis}
                  onStatBasisChange={setStatBasis}
                  onPlayerClick={handlePlayerClick}
                  scoringCategories={league?.scoringCategories}
                  getNote={getNote}
                  onNoteChange={setNote}
                  draftedIds={draftedIds}
                  draftedByTeam={draftedByTeam}
                  draftedContractByPlayerId={draftedContractByPlayerId}
                  isCustomPlayer={isCustomPlayer}
                />
              )}
            </>
          )}
          {selectedView === "tiers" && (
            <div className="coming-soon">
              <h2>Tiers</h2>
              <p>Coming soon...</p>
            </div>
          )}
          {selectedView === "depth-charts" && (
            <div className="depth-chart-wrapper">
              <div className="depth-chart-header">
                <div>
                  <h2>Depth Charts</h2>
                  <p>
                    Daily active-roster depth with starter/backup/reserve ranking
                  </p>
                </div>
                <div className="depth-chart-controls">
                  <label htmlFor="depth-team-select">Team</label>
                  <select
                    id="depth-team-select"
                    value={selectedDepthTeamId}
                    onChange={(event) => {
                      setSelectedDepthTeamId(Number(event.target.value));
                    }}
                  >
                    {MLB_TEAMS.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.abbr} - {team.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="depth-chart-refresh-btn"
                    onClick={() => void loadDepthChart(selectedDepthTeamId, true)}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {depthChartError && (
                <p className="research-error">{depthChartError}</p>
              )}

              {isLoadingDepthChart ? (
                <div className="coming-soon">
                  <h2>Loading Depth Chart</h2>
                  <p>Fetching active roster and recent usage trends...</p>
                </div>
              ) : !depthChartData ? (
                <div className="coming-soon">
                  <h2>No Depth Data</h2>
                  <p>Depth chart data is currently unavailable.</p>
                </div>
              ) : (
                <>
                  <div className="depth-chart-meta">
                    <span>
                      Updated {new Date(depthChartData.generatedAt).toLocaleString()}
                    </span>
                    <span>
                      Roster {depthChartData.rosterCount}/{depthChartData.rosterLimit}
                    </span>
                    <span>
                      Assignments {depthAssignedCount}/{depthTotalSlots}
                    </span>
                    <span>
                      Manual review {depthChartData.manualReview.length}
                    </span>
                    <span
                      className={`depth-chart-limit-chip ${depthChartData.constraints.rosterLimitRespected ? "is-ok" : "is-warning"}`}
                    >
                      {depthChartData.constraints.note}
                    </span>
                  </div>

                  <div className="depth-chart-grid">
                    {DEPTH_POSITIONS.map((position) => {
                      const rows = depthChartData.positions[position] ?? [];
                      return (
                        <section key={position} className="position-group">
                          <div className="position-group__header">
                            <h3 className="position-group__title">{position}</h3>
                            <span className="position-group__fill">
                              {(depthChartData.positions[position] ?? []).length}/3
                            </span>
                          </div>
                          <div className="position-group__body">
                            <div className="position-group__table-head">
                              <span>Rank</span>
                              <span>Player</span>
                              <span>Status</span>
                              <span>Usage</span>
                            </div>
                            {[1, 2, 3].map((rank) => {
                              const row = rows.find((item) => item.rank === rank);
                              const rankClass =
                                rank === 1
                                  ? "player-slot--starter"
                                  : rank === 2
                                    ? "player-slot--backup"
                                    : "player-slot--reserve";
                              const injured =
                                row && /injured|\bil\b/i.test(row.status);

                              return (
                                <div
                                  key={`${position}-${rank}`}
                                  className={`player-slot ${rankClass} ${injured ? "player-slot--injured" : ""} ${row?.outOfPosition || row?.needsManualReview ? "player-slot--oof" : ""} ${row ? "player-slot--clickable" : ""}`}
                                  role={row ? "button" : undefined}
                                  tabIndex={row ? 0 : undefined}
                                  onClick={() => {
                                    if (row) {
                                      void handleDepthPlayerClick(row);
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (!row) return;
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      void handleDepthPlayerClick(row);
                                    }
                                  }}
                                >
                                  <div className="player-slot__rank">#{rank}</div>
                                  {row ? (
                                    <>
                                      <div className="player-slot__content">
                                        <div className="player-slot__name-line">
                                          <div className="player-slot__name">{row.playerName}</div>
                                          <div className="player-slot__chips">
                                            <span className="player-slot__chip">{row.primaryPosition}</span>
                                            {injured && <span className="player-slot__chip player-slot__chip--injured">INJ</span>}
                                            {(row.outOfPosition || row.needsManualReview) && (
                                              <span className="player-slot__chip player-slot__chip--oof">OOF</span>
                                            )}
                                          </div>
                                        </div>
                                        {(row.outOfPosition || row.needsManualReview) && (
                                          <div className="player-slot__flag">Manual review suggested</div>
                                        )}
                                      </div>
                                      <div className="player-slot__meta player-slot__meta--status">
                                        <span>{row.status}</span>
                                      </div>
                                      <div className="player-slot__meta player-slot__meta--usage">
                                        <div className="player-slot__usage-text">
                                          <span>{row.usageStarts} starts</span>
                                          <span>{row.usageAppearances} apps</span>
                                        </div>
                                        <button
                                          type="button"
                                          className={`btn-star depth-slot-star ${isInWatchlist(String(row.playerId)) ? "starred" : ""}`}
                                          aria-label={
                                            isInWatchlist(String(row.playerId))
                                              ? `Remove ${row.playerName} from watchlist`
                                              : `Add ${row.playerName} to watchlist`
                                          }
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void handleDepthStarToggle(row);
                                          }}
                                        >
                                          <Star size={14} fill={isInWatchlist(String(row.playerId)) ? "#fbbf24" : "none"} />
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="player-slot__content player-slot__content--empty">
                                        No assignment
                                      </div>
                                      <div className="player-slot__meta player-slot__meta--status">-</div>
                                      <div className="player-slot__meta player-slot__meta--usage">-</div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  {depthChartData.manualReview.length > 0 && (
                    <section className="depth-chart-manual-review">
                      <h3>Manual Review Required</h3>
                      <ul>
                        {depthChartData.manualReview.map((item) => (
                          <li key={`${item.playerId}-${item.requestedPosition}`}>
                            {item.playerName} - {item.requestedPosition} ({item.reason})
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={addCustomPlayer}
      />
      <PlayerDetailModal
        isOpen={selectedModalPlayer !== null}
        player={selectedModalPlayer}
        draftedByTeam={
          selectedModalPlayer
            ? draftedByTeam.get(selectedModalPlayer.id)
            : undefined
        }
        draftedContract={
          selectedModalPlayer
            ? draftedContractByPlayerId.get(selectedModalPlayer.id)
            : undefined
        }
        note={selectedModalPlayer ? getNote(selectedModalPlayer.id) : ""}
        isCustomPlayer={
          selectedModalPlayer ? isCustomPlayer(selectedModalPlayer.id) : false
        }
        onClose={() => setSelectedModalPlayer(null)}
        onMoveToCommandCenter={handleMoveToCommandCenter}
      />
    </div>
  );
}