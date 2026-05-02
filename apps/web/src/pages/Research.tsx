import { useCallback, useEffect, useMemo, useState } from "react";
import { useResearchPositionFilter } from "../hooks/useResearchPositionFilter";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { Star } from "lucide-react";
import PlayerTable from "../components/PlayerTable";
import type { Player } from "../types/player";
import {
  getDepthChartCached,
  getPlayers,
  getPlayersCached,
  getTeamDepthChart,
  type DepthChartPlayerRow,
  type DepthChartResponse,
} from "../api/players";
import { getValuation } from "../api/engine";
import { getRoster, getRosterCached, type RosterEntry } from "../api/roster";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import "./Research.css";
import AddPlayerModal from "../components/AddPlayerModal";
import PlayerDetailModal from "../components/PlayerDetailModal";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import {
  defaultValuationSortForPage,
  mergeCatalogPlayersWithValuations,
  type ValuationShape,
} from "../utils/valuation";
import {
  findCatalogPlayerByExternalId,
  lookupRosterMapForCatalogPlayer,
} from "../domain/catalogPlayerKeys";
import {
  buildDraftedByTeamMap,
  buildKeeperContractByPlayerMap,
} from "../domain/rosterMaps";
import { researchValuationRowMapFromEngine } from "../domain/researchValuationMap";
import TiersView from "./TiersView";
import { resolveUserTeamId } from "../utils/team";
import {
  type StatBasis,
  parseStatBasis,
  RESEARCH_STAT_BASIS_STORAGE_KEY_WEB,
} from "@repo/player-stat-basis";
import { MLB_TEAMS } from "../data/mlbTeams";
import { filterResearchCatalogPlayers } from "../domain/researchCatalogFilter";
import {
  countDepthChartAssignments,
  DEFAULT_RESEARCH_DEPTH_TEAM_ID,
  RESEARCH_DEPTH_POSITIONS,
  researchDepthSlotCapacity,
} from "../domain/researchDepthLayout";
import { ResearchDepthChartToolbar } from "../components/research/ResearchDepthChartToolbar";
import {
  ResearchViewTabs,
  type ResearchView,
} from "../components/research/ResearchViewTabs";

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
  const [selectedDepthTeamId, setSelectedDepthTeamId] = useState(
    DEFAULT_RESEARCH_DEPTH_TEAM_ID,
  );
  const [depthChartData, setDepthChartData] = useState<DepthChartResponse | null>(
    () => getDepthChartCached(DEFAULT_RESEARCH_DEPTH_TEAM_ID),
  );
  const [isLoadingDepthChart, setIsLoadingDepthChart] = useState(
    () => getDepthChartCached(DEFAULT_RESEARCH_DEPTH_TEAM_ID) === null,
  );
  const [depthChartError, setDepthChartError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useResearchPositionFilter();
  const [statBasis, setStatBasis] = useState<StatBasis>(() => {
    try {
      return parseStatBasis(
        localStorage.getItem(RESEARCH_STAT_BASIS_STORAGE_KEY_WEB),
        "last-year",
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

  const draftedByTeam = useMemo(
    () => buildDraftedByTeamMap(rosterEntries, league?.teamNames),
    [rosterEntries, league?.teamNames],
  );

  const draftedContractByPlayerId = useMemo(
    () => buildKeeperContractByPlayerMap(rosterEntries),
    [rosterEntries],
  );

  const depthTotalSlots = researchDepthSlotCapacity();
  const depthAssignedCount = useMemo(
    () => (depthChartData ? countDepthChartAssignments(depthChartData) : 0),
    [depthChartData],
  );

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
      localStorage.setItem(RESEARCH_STAT_BASIS_STORAGE_KEY_WEB, statBasis);
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
        const merged = researchValuationRowMapFromEngine(
          res.valuations,
          customPlayerIds,
        );
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

  const filteredPlayers = useMemo(
    () => filterResearchCatalogPlayers(allPlayers, searchQuery, positionFilter),
    [allPlayers, searchQuery, positionFilter],
  );

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
    const fromLoaded = findCatalogPlayerByExternalId(allPlayers, slot.playerId);
    if (fromLoaded) return fromLoaded;

    const playersFromApi = await getPlayers(
      "adp",
      league?.posEligibilityThreshold,
      league?.playerPool,
    );
    setPlayers(playersFromApi);

    return findCatalogPlayerByExternalId(playersFromApi, slot.playerId) ?? null;
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

  return (
    <div className="research-page">
      <div className="research-layout">

        <ResearchViewTabs
          selectedView={selectedView}
          onSelectView={setSelectedView}
          onOpenAddPlayer={() => setShowAddModal(true)}
        />

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
                  defaultValuationSortField={defaultValuationSortForPage("Research")}
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
            <TiersView
              players={mergedPlayers}
              onPlayerClick={handlePlayerClick}
              isInWatchlist={isInWatchlist}
              addToWatchlist={addToWatchlist}
              removeFromWatchlist={removeFromWatchlist}
              onMoveToCommandCenter={handleMoveToCommandCenter}
            />
          )}
          {selectedView === "depth-charts" && (
            <div className="depth-chart-wrapper">
              <ResearchDepthChartToolbar
                teams={MLB_TEAMS}
                selectedTeamId={selectedDepthTeamId}
                onTeamChange={setSelectedDepthTeamId}
                onRefresh={() =>
                  void loadDepthChart(selectedDepthTeamId, true)
                }
              />

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
                    {RESEARCH_DEPTH_POSITIONS.map((position) => {
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
        statBasis={statBasis}
        draftedByTeam={
          selectedModalPlayer
            ? lookupRosterMapForCatalogPlayer(draftedByTeam, selectedModalPlayer)
            : undefined
        }
        draftedContract={
          selectedModalPlayer
            ? lookupRosterMapForCatalogPlayer(
                draftedContractByPlayerId,
                selectedModalPlayer,
              )
            : undefined
        }
        note={selectedModalPlayer ? getNote(selectedModalPlayer.id) : ""}
        onNoteChange={setNote}
        isCustomPlayer={
          selectedModalPlayer ? isCustomPlayer(selectedModalPlayer.id) : false
        }
        onClose={() => setSelectedModalPlayer(null)}
        onMoveToCommandCenter={handleMoveToCommandCenter}
      />
    </div>
  );
}