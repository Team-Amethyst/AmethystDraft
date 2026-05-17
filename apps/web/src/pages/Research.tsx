import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { Database, BarChart3, Layers, UserPlus } from "lucide-react";
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
import { getValuation, getValuationPlayer, type ValuationResponse } from "../api/engine";
import {
  buildValuationBoardCacheKey,
  peekBoardValuationCache,
} from "../api/valuationCache";
import {
  classifyBoardValuationFetchPhase,
  type BoardValuationUiPhase,
} from "../domain/boardValuationFetchPhase";
import {
  filterValuationAlertsForSurface,
  normalizeValuationAlerts,
} from "../domain/valuationAlerts";
import { useValuationBoardAlerts } from "../contexts/ValuationBoardAlertsContext";
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
  mergePlayerWithFocusedExplainEnrichment,
  mergePlayerWithValuation,
  type ValuationShape,
} from "../utils/valuation";
import {
  findCatalogPlayerByExternalId,
  lookupRosterMapForCatalogPlayer,
} from "../domain/catalogPlayerKeys";
import {
  buildDraftedByTeamMap,
  buildDraftedPriceByPlayerMap,
  buildKeeperContractByPlayerMap,
} from "../domain/rosterMaps";
import { researchValuationRowMapFromEngine } from "../domain/researchValuationMap";
import TiersView from "./TiersView";
import { resolveUserTeamId, resolvedLeagueTeamNames } from "../utils/team";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import {
  type StatBasis,
  parseStatBasis,
  RESEARCH_STAT_BASIS_STORAGE_KEY_WEB,
} from "@repo/player-stat-basis";
import { MLB_TEAMS } from "../data/mlbTeams";
import {
  filterResearchCatalogPlayers,
  filterResearchDefaultCatalogKind,
} from "../domain/researchCatalogFilter";
import { DEFAULT_RESEARCH_DEPTH_TEAM_ID } from "../domain/researchDepthLayout";
import {
  diagnosisDepthChartMatching,
  formatDiagnosticsForConsole,
} from "../domain/depthChartDiagnostics";
import {
  auditDepthChartTeam,
  logDepthChartAudit,
} from "../domain/depthChartMatchAudit";
import {
  getDepthRowResolution,
  buildDepthRowResolutionCache,
  resolveDepthRowMatch,
} from "../domain/depthChartRowMatch";
import {
  attachResearchDraftableFlags,
  normalizeDraftablePoolMeta,
} from "../domain/draftablePoolSemantics";
import { readResearchModelColumnsPreference } from "../constants/playerTableStorage";
import {
  buildDepthChartStubPlayer,
  depthChartModalContextFromRow,
  type DepthChartModalContext,
} from "../domain/depthChartPlayerProfile";
import { DepthChartView } from "../components/research/DepthChartView";
import { DepthChartUnmatchedModal } from "../components/research/DepthChartUnmatchedModal";

type ResearchView = "player-database" | "tiers" | "depth-charts";

/** Must match `isValuationContextDebugEnabled` in PlayerDetailModal. */
function isValuationContextDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem("showValuationDebug") === "1";
  } catch {
    return false;
  }
}

export default function Research() {
  usePageTitle("Research");

  const { customPlayers, addCustomPlayer, isCustomPlayer } = useCustomPlayers();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState<Player | null>(null);
  const [modalDepthChartOnlyMode, setModalDepthChartOnlyMode] = useState<
    "depth_only" | "catalog_only" | null
  >(null);
  const [modalDepthChartContext, setModalDepthChartContext] =
    useState<DepthChartModalContext | null>(null);

  const { id: leagueId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setSelectedPlayer } = useSelectedPlayer();
  const { league } = useLeague();
  const leagueRef = useRef(league);
  leagueRef.current = league;
  const { token, user } = useAuth();
  const { getNote, setNote } = usePlayerNotes();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, watchlist } = useWatchlist();

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
  const [depthChartSearchQuery, setDepthChartSearchQuery] = useState("");
  const [unmatchedDepthModal, setUnmatchedDepthModal] = useState<{
    row: DepthChartPlayerRow;
    chartPosition: DepthChartPosition;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [researchModelColumnsVisible, setResearchModelColumnsVisible] =
    useState(() => readResearchModelColumnsPreference());
  const [positionFilter, setPositionFilter] = useState(() => {
    try {
      return localStorage.getItem("amethyst-research-position") ?? "all";
    } catch {
      return "all";
    }
  });
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
    () => getPlayersCached("catalog_rank") ?? [],
  );
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(
    () => getPlayersCached("catalog_rank") === null,
  );
  const [playersError, setPlayersError] = useState("");
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationShape>
  >(() => new Map());
  const [lastResearchBoardValuation, setLastResearchBoardValuation] =
    useState<ValuationResponse | null>(null);
  const [researchBoardPhase, setResearchBoardPhase] =
    useState<BoardValuationUiPhase>("idle");
  const [researchBoardError, setResearchBoardError] = useState<string | null>(
    null,
  );
  const researchPositionSlotKeys = useMemo(
    () => (league?.rosterSlots ? Object.keys(league.rosterSlots) : undefined),
    [league?.rosterSlots],
  );
  const researchBoardSuccessKeyRef = useRef<string | null>(null);
  const lastResearchBoardRef = useRef<ValuationResponse | null>(null);

  useEffect(() => {
    lastResearchBoardRef.current = lastResearchBoardValuation;
  }, [lastResearchBoardValuation]);

  const valuationBoardMeta = useMemo(() => {
    if (!lastResearchBoardValuation) return null;
    return {
      warnings: lastResearchBoardValuation.valuation_context_warnings,
      context: lastResearchBoardValuation.valuation_context,
    };
  }, [lastResearchBoardValuation]);

  const draftablePoolMeta = useMemo(() => {
    if (!lastResearchBoardValuation) return { kind: "unknown" as const };
    return normalizeDraftablePoolMeta(
      lastResearchBoardValuation as unknown as Record<string, unknown>,
    );
  }, [lastResearchBoardValuation]);

  const researchValuationAlerts = useMemo(
    () =>
      filterValuationAlertsForSurface(
        normalizeValuationAlerts(lastResearchBoardValuation),
        "research",
      ),
    [lastResearchBoardValuation],
  );

  const { publishBoardValuationAlerts } = useValuationBoardAlerts();
  useEffect(() => {
    publishBoardValuationAlerts(researchValuationAlerts);
  }, [researchValuationAlerts, publishBoardValuationAlerts]);
  useEffect(() => {
    return () => {
      publishBoardValuationAlerts([]);
    };
  }, [publishBoardValuationAlerts]);

  const [modalExplainRow, setModalExplainRow] = useState<ValuationShape | null>(
    null,
  );
  const [modalExplainLoading, setModalExplainLoading] = useState(false);

  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>(
    () => getRosterCached(leagueId ?? "") ?? [],
  );

  const draftedIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.externalPlayerId)),
    [rosterEntries],
  );

  const draftedByTeam = useMemo(
    () =>
      buildDraftedByTeamMap(
        rosterEntries,
        league ? resolvedLeagueTeamNames(league) : undefined,
      ),
    [rosterEntries, league?.teams, league?.teamNames?.join("\u0001")],
  );

  const draftedContractByPlayerId = useMemo(
    () => buildKeeperContractByPlayerMap(rosterEntries),
    [rosterEntries],
  );

  const draftedPriceByPlayerId = useMemo(
    () => buildDraftedPriceByPlayerMap(rosterEntries),
    [rosterEntries],
  );

  const customPlayerIds = useMemo(
    () => new Set(customPlayers.map((p) => p.id)),
    [customPlayers],
  );

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.teams,
      league?.budget,
      league ? JSON.stringify(league.rosterSlots) : "",
      league ? JSON.stringify(league.scoringCategories) : "",
      league?.memberIds?.join(","),
      league?.posEligibilityThreshold,
      league?.playerPool,
      league?.teamNames?.join("\u0001"),
    ],
  );

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  const researchBoardCacheExtras = useMemo(() => {
    const ids = [...customPlayerIds].sort().join(",");
    return ids ? `custom:${ids}` : "";
  }, [customPlayerIds]);

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
      localStorage.setItem(RESEARCH_STAT_BASIS_STORAGE_KEY_WEB, statBasis);
    } catch { /* noop */ }
  }, [statBasis]);

  useEffect(() => {
    const loadPlayers = async () => {
      const cached = getPlayersCached(
        "catalog_rank",
        league?.posEligibilityThreshold,
        league?.playerPool,
      );
      if (!cached) setIsLoadingPlayers(true);
      setPlayersError("");

      try {
        const playersFromApi = await getPlayers(
          "catalog_rank",
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

    void loadPlayers();
  }, [league?.posEligibilityThreshold, league?.playerPool]);

  useEffect(() => {
    // Wait for league row from layout context. Otherwise `leagueValuationConfigKey(null)` is ""
    // and `resolveUserTeamId` falls back to `team_1`; when leagues load we re-run with a new
    // cache key and fire a second board POST while the first is still pending (duplicate Network).
    const leagueRow = leagueRef.current;
    if (!token || !leagueId || !leagueRow || players.length === 0) {
      setValuationsByPlayerId(new Map());
      setLastResearchBoardValuation(null);
      setResearchBoardPhase("idle");
      setResearchBoardError(null);
      researchBoardSuccessKeyRef.current = null;
      return;
    }
    const userTeamId = resolveUserTeamId(leagueRow, user?.id);
    const cacheCtx = {
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationKey,
      extras: researchBoardCacheExtras || undefined,
    };
    const activeCacheKey = buildValuationBoardCacheKey(
      leagueId,
      userTeamId,
      cacheCtx,
    );
    const peek = peekBoardValuationCache(leagueId, userTeamId, cacheCtx);
    const pre = classifyBoardValuationFetchPhase({
      canStartFetch: true,
      peekHit: peek !== undefined,
      activeCacheKey,
      lastSuccessCacheKey: researchBoardSuccessKeyRef.current,
      displayedBoardPresent: lastResearchBoardRef.current !== null,
    });

    if (pre === "ready_sync") {
      setResearchBoardPhase("ready");
      setResearchBoardError(null);
    } else if (pre === "refreshing") {
      setResearchBoardPhase("refreshing");
      setResearchBoardError(null);
    } else {
      setResearchBoardPhase("loading");
      setResearchBoardError(null);
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await getValuation(leagueId, token, userTeamId, null, {
          leagueConfigKey: leagueValuationKey,
          rosterFingerprint: rosterValuationKey,
          extras: researchBoardCacheExtras || undefined,
        });
        const merged = researchValuationRowMapFromEngine(
          res.valuations,
          customPlayerIds,
        );
        if (!cancelled) {
          researchBoardSuccessKeyRef.current = activeCacheKey;
          setValuationsByPlayerId(merged);
          setLastResearchBoardValuation(res);
          setResearchBoardPhase("ready");
          setResearchBoardError(null);
        }
      } catch {
        if (!cancelled) {
          setResearchBoardPhase("error");
          setResearchBoardError("Unable to load league valuation.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    leagueId,
    players.length,
    user?.id,
    rosterValuationKey,
    leagueValuationKey,
    researchBoardCacheExtras,
  ]);

  useEffect(() => {
    if (!selectedModalPlayer || modalDepthChartOnlyMode || !token || !leagueId) {
      setModalExplainRow(null);
      setModalExplainLoading(false);
      return;
    }
    if (researchBoardPhase === "idle" || researchBoardPhase === "loading") {
      setModalExplainLoading(researchBoardPhase === "loading");
      return;
    }
    let cancelled = false;
    setModalExplainLoading(true);
    const userTeamId = resolveUserTeamId(league, user?.id);
    const pid = String(selectedModalPlayer.id).trim();
    void getValuationPlayer(leagueId, token, selectedModalPlayer.id, userTeamId, {
      explainValuationRows: true,
      cacheContext: {
        leagueConfigKey: leagueValuationKey,
        rosterFingerprint: rosterValuationKey,
        extras: researchBoardCacheExtras || undefined,
      },
    })
      .then((res) => {
        if (cancelled) return;
        const row =
          res.player ??
          res.valuations.find((v) => String(v.player_id).trim() === pid);
        setModalExplainRow(row ? (row as ValuationShape) : null);
      })
      .catch(() => {
        if (!cancelled) setModalExplainRow(null);
      })
      .finally(() => {
        if (!cancelled) setModalExplainLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedModalPlayer?.id,
    modalDepthChartOnlyMode,
    token,
    leagueId,
    user?.id,
    rosterValuationKey,
    leagueValuationKey,
    researchBoardCacheExtras,
    researchBoardPhase,
  ]);

  const loadDepthChart = useCallback(async (teamId: number, forceRefresh = false) => {
    const cached = getDepthChartCached(teamId);
    if (!cached || forceRefresh) {
      setIsLoadingDepthChart(true);
    }
    setDepthChartError("");

    try {
      const depth = await getTeamDepthChart(teamId, undefined, forceRefresh);
      setDepthChartData(depth);
    } catch {
      setDepthChartError("Unable to load depth chart. Try refresh.");
    } finally {
      setIsLoadingDepthChart(false);
    }
  }, []);

  useEffect(() => {
    if (selectedView !== "depth-charts") return;
    void loadDepthChart(selectedDepthTeamId);
  }, [selectedDepthTeamId, selectedView, loadDepthChart]);

  const playersForResearch = useMemo(
    () => filterResearchDefaultCatalogKind(players),
    [players],
  );

  // Merge MLB API players with custom players — custom players appear at the top
  const allPlayers = useMemo(
    () => [...customPlayers, ...playersForResearch],
    [playersForResearch, customPlayers],
  );

  const selectedDepthTeamAbbr = useMemo(
    () => MLB_TEAMS.find((t) => t.id === selectedDepthTeamId)?.abbr ?? "—",
    [selectedDepthTeamId],
  );

  useEffect(() => {
    if (!depthChartData || selectedView !== "depth-charts") return;

    const audit = auditDepthChartTeam(
      depthChartData,
      selectedDepthTeamAbbr,
      allPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
    );
    logDepthChartAudit(audit);

    const diagnostics = diagnosisDepthChartMatching(
      depthChartData,
      players,
      rosterEntries,
      watchlist,
    );
    if (diagnostics.summaryStats.unmatched > 0) {
      console.log(
        "%c📊 Depth Chart Diagnostics (legacy)",
        "color: #4f46e5; font-weight: bold; font-size: 12px",
        formatDiagnosticsForConsole(diagnostics),
      );
    }
  }, [
    depthChartData,
    selectedView,
    players,
    rosterEntries,
    watchlist,
    allPlayers,
    valuationsByPlayerId,
    selectedDepthTeamAbbr,
  ]);

  const filteredPlayers = useMemo(
    () => filterResearchCatalogPlayers(allPlayers, searchQuery, positionFilter),
    [allPlayers, searchQuery, positionFilter],
  );

  const mergedPlayers = useMemo(
    () => mergeCatalogPlayersWithValuations(filteredPlayers, valuationsByPlayerId),
    [filteredPlayers, valuationsByPlayerId],
  );

  const mergedPlayersWithDraftable = useMemo(
    () =>
      attachResearchDraftableFlags(
        mergedPlayers,
        draftablePoolMeta,
        isCustomPlayer,
      ),
    [mergedPlayers, draftablePoolMeta, isCustomPlayer],
  );

  const researchTablePlayers = mergedPlayersWithDraftable;

  const displayModalPlayer = useMemo(() => {
    if (!selectedModalPlayer || modalDepthChartOnlyMode) return null;
    const boardRow = valuationsByPlayerId.get(selectedModalPlayer.id);
    let p = mergePlayerWithValuation(selectedModalPlayer, boardRow);
    if (modalExplainRow) {
      p = mergePlayerWithFocusedExplainEnrichment(p, boardRow, modalExplainRow);
    }
    return p;
  }, [selectedModalPlayer, modalDepthChartOnlyMode, valuationsByPlayerId, modalExplainRow]);

  const closePlayerModal = useCallback(() => {
    setSelectedModalPlayer(null);
    setModalDepthChartOnlyMode(null);
    setModalDepthChartContext(null);
    setUnmatchedDepthModal(null);
  }, []);

  const handlePlayerClick = (player: Player) => {
    setModalDepthChartOnlyMode(null);
    setModalDepthChartContext(null);
    setSelectedModalPlayer(player);
  };

  const handleMoveToCommandCenter = (player: Player) => {
    if (modalDepthChartOnlyMode) return;
    setSelectedPlayer(player);
    closePlayerModal();
    void navigate(`/leagues/${leagueId ?? ""}/command-center`);
  };

  const resolveDepthPlayer = useCallback(async (slot: DepthChartPlayerRow): Promise<Player | null> => {
    const fromLoaded = findCatalogPlayerByExternalId(allPlayers, slot.playerId);
    if (fromLoaded) return fromLoaded;

    const playersFromApi = await getPlayers(
      "catalog_rank",
      league?.posEligibilityThreshold,
      league?.playerPool,
    );
    setPlayers(playersFromApi);

    return findCatalogPlayerByExternalId(playersFromApi, slot.playerId) ?? null;
  }, [allPlayers, league?.playerPool, league?.posEligibilityThreshold]);

  const handleDepthPlayerClick = useCallback(
    async (slot: DepthChartPlayerRow, chartPosition: DepthChartPosition) => {
      setDepthChartError("");
      setUnmatchedDepthModal(null);

      const resolution = resolveDepthRowMatch(
        slot,
        chartPosition,
        selectedDepthTeamAbbr,
        allPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      );

      try {
        switch (resolution.state) {
          case "unmatched":
            setUnmatchedDepthModal({ row: slot, chartPosition });
            return;
          case "depth_only":
            setModalDepthChartOnlyMode("depth_only");
            setModalDepthChartContext(
              depthChartModalContextFromRow(slot, chartPosition),
            );
            setSelectedModalPlayer(
              buildDepthChartStubPlayer(slot, selectedDepthTeamAbbr),
            );
            return;
          case "catalog_only": {
            const matched =
              resolution.catalogPlayer ??
              (await resolveDepthPlayer(slot));
            if (!matched) {
              setUnmatchedDepthModal({ row: slot, chartPosition });
              return;
            }
            setModalDepthChartOnlyMode("catalog_only");
            setModalDepthChartContext(
              depthChartModalContextFromRow(slot, chartPosition),
            );
            setSelectedModalPlayer(matched);
            return;
          }
          case "rostered":
          case "valued": {
            const matched =
              resolution.catalogPlayer ??
              (await resolveDepthPlayer(slot));
            if (matched) {
              handlePlayerClick(matched);
              return;
            }
            setUnmatchedDepthModal({ row: slot, chartPosition });
            return;
          }
          default:
            break;
        }
      } catch {
        setUnmatchedDepthModal({ row: slot, chartPosition });
      }
    },
    [
      allPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
      handlePlayerClick,
      resolveDepthPlayer,
      selectedDepthTeamAbbr,
    ],
  );

  const depthResolutionCache = useMemo(() => {
    if (!depthChartData) return new Map();
    return buildDepthRowResolutionCache(
      depthChartData,
      selectedDepthTeamAbbr,
      allPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
    );
  }, [
    depthChartData,
    selectedDepthTeamAbbr,
    allPlayers,
    rosterEntries,
    watchlist,
    valuationsByPlayerId,
  ]);

  const handleDepthStarToggle = useCallback(
    async (slot: DepthChartPlayerRow, chartPosition: DepthChartPosition) => {
      const resolution = getDepthRowResolution(
        depthResolutionCache,
        slot,
        chartPosition,
        selectedDepthTeamAbbr,
        allPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      );
      if (!resolution.audit.fantasy.watchlistSupported) return;
      setDepthChartError("");
      try {
        const matched = await resolveDepthPlayer(slot);
        if (!matched) return;

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
    },
    [
      addToWatchlist,
      depthResolutionCache,
      isInWatchlist,
      removeFromWatchlist,
      resolveDepthPlayer,
      selectedDepthTeamAbbr,
      allPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
    ],
  );

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
                <>
                  <PlayerTable
                    columnLayout="research"
                    defaultValuationSortField={defaultValuationSortForPage(
                      "Research",
                    )}
                    players={researchTablePlayers}
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
                    draftedPriceByPlayerId={draftedPriceByPlayerId}
                    draftedContractByPlayerId={draftedContractByPlayerId}
                    isCustomPlayer={isCustomPlayer}
                    researchEngineBoardPhase={researchBoardPhase}
                    researchModelColumnsVisible={researchModelColumnsVisible}
                    onResearchModelColumnsVisibleChange={
                      setResearchModelColumnsVisible
                    }
                    draftDisplaySlotKeys={researchPositionSlotKeys}
                  />
                  {researchBoardPhase === "loading" ? (
                    <p className="research-board-engine-hint">
                      Loading Engine valuation for this league…
                    </p>
                  ) : null}
                  {researchBoardPhase === "refreshing" ? (
                    <p className="research-board-engine-hint">
                      Updating values…
                    </p>
                  ) : null}
                  {researchBoardPhase === "error" ? (
                    <p className="research-board-engine-hint research-board-engine-hint--error">
                      {researchBoardError ??
                        "Valuation request failed; Engine columns may be incomplete."}
                    </p>
                  ) : null}
                </>
              )}
            </>
          )}
          {selectedView === "tiers" && (
            <TiersView
              players={mergedPlayers}
              draftedIds={draftedIds}
              draftedByTeam={draftedByTeam}
              draftedPriceByPlayerId={draftedPriceByPlayerId}
              draftedContractByPlayerId={draftedContractByPlayerId}
              onPlayerClick={handlePlayerClick}
              isInWatchlist={isInWatchlist}
              addToWatchlist={addToWatchlist}
              removeFromWatchlist={removeFromWatchlist}
              isCustomPlayer={isCustomPlayer}
              draftDisplaySlotKeys={researchPositionSlotKeys}
              statBasis={statBasis}
              scoringCategories={league?.scoringCategories}
              getNote={getNote}
              onNoteChange={setNote}
            />
          )}
          {selectedView === "depth-charts" && (
            <>
              {depthChartError ? (
                <p className="research-error">{depthChartError}</p>
              ) : null}
              {isLoadingDepthChart ? (
                <div className="coming-soon depth-chart-loading">
                  <h2>Loading depth chart…</h2>
                  <p>Fetching active roster and recent usage trends.</p>
                </div>
              ) : !depthChartData ? (
                <div className="coming-soon">
                  <h2>Unable to load depth chart</h2>
                  <p>Try refresh.</p>
                </div>
              ) : (
                <DepthChartView
                  depthChartData={depthChartData}
                  selectedTeamId={selectedDepthTeamId}
                  teamAbbr={selectedDepthTeamAbbr}
                  catalogPlayers={allPlayers}
                  rosterEntries={rosterEntries}
                  watchlist={watchlist}
                  valuationsByPlayerId={valuationsByPlayerId}
                  draftDisplaySlotKeys={researchPositionSlotKeys}
                  leagueTeamNames={
                    league ? resolvedLeagueTeamNames(league) : undefined
                  }
                  searchQuery={depthChartSearchQuery}
                  onSearchChange={setDepthChartSearchQuery}
                  onTeamChange={setSelectedDepthTeamId}
                  onRefresh={() => void loadDepthChart(selectedDepthTeamId, true)}
                  isInWatchlist={isInWatchlist}
                  onPlayerClick={(row, position) => {
                    void handleDepthPlayerClick(row, position);
                  }}
                  onStarToggle={(row, position) => {
                    void handleDepthStarToggle(row, position);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      <DepthChartUnmatchedModal
        isOpen={unmatchedDepthModal !== null}
        row={unmatchedDepthModal?.row ?? null}
        chartPosition={unmatchedDepthModal?.chartPosition ?? ""}
        teamAbbr={selectedDepthTeamAbbr}
        onClose={() => setUnmatchedDepthModal(null)}
      />

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={addCustomPlayer}
      />
      <PlayerDetailModal
        isOpen={selectedModalPlayer !== null}
        player={
          modalDepthChartOnlyMode
            ? selectedModalPlayer
            : displayModalPlayer ?? selectedModalPlayer
        }
        depthChartOnlyMode={modalDepthChartOnlyMode}
        depthChartContext={modalDepthChartContext}
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
        onClose={closePlayerModal}
        onMoveToCommandCenter={handleMoveToCommandCenter}
        valuationContextWarnings={valuationBoardMeta?.warnings}
        valuationContextDev={
          isValuationContextDebugEnabled()
            ? valuationBoardMeta?.context ?? null
            : undefined
        }
        valuationExplainLoading={modalExplainLoading}
        researchEngineBoardPhase={researchBoardPhase}
        researchSurface
        researchShowModelMetrics={researchModelColumnsVisible}
        draftDisplaySlotKeys={researchPositionSlotKeys}
      />
    </div>
  );
}