import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { Database, BarChart3, Layers, UserPlus } from "lucide-react";
import PlayerTable from "../components/PlayerTable";
import type { Player } from "../types/player";
import { getPlayers, getPlayersCached } from "../api/players";
import { getCatalogBatchValues } from "../api/engine";
import { getRoster, getRosterCached, type RosterEntry } from "../api/roster";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import {
  hasPitcherEligibility,
  normalizePlayerPositions,
} from "../utils/eligibility";
import "./Research.css";
import AddPlayerModal from "../components/AddPlayerModal";
import { useCustomPlayers } from "../hooks/useCustomPlayers";

export default function Research() {
  usePageTitle("Research");

  const { customPlayers, addCustomPlayer, isCustomPlayer } = useCustomPlayers();
  const [showAddModal, setShowAddModal] = useState(false);

  const { id: leagueId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setSelectedPlayer } = useSelectedPlayer();
  const { league } = useLeague();
  const { token } = useAuth();
  const { getNote, setNote } = usePlayerNotes();

  const [selectedView, setSelectedView] = useState("player-database");
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
  const [engineCatalogByPlayerId, setEngineCatalogByPlayerId] = useState<
    ReadonlyMap<string, { value: number; tier: number }>
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
    if (!token || players.length === 0) {
      setEngineCatalogByPlayerId(new Map());
      return;
    }
    const pool = league?.playerPool ?? "Mixed";
    let cancelled = false;
    const BATCH = 150;
    const ids = players
      .filter((p) => !isCustomPlayer(p.id))
      .map((p) => p.id);

    void (async () => {
      const merged = new Map<string, { value: number; tier: number }>();
      for (let i = 0; i < ids.length; i += BATCH) {
        if (cancelled) return;
        const chunk = ids.slice(i, i + BATCH);
        if (chunk.length === 0) continue;
        try {
          const res = await getCatalogBatchValues(token, {
            player_ids: chunk,
            league_scope: pool,
            pos_eligibility_threshold: league?.posEligibilityThreshold,
          });
          for (const row of res.players) {
            merged.set(row.player_id, {
              value: row.value,
              tier: row.tier,
            });
          }
        } catch {
          /* best-effort; table still shows list Proj $ */
        }
      }
      if (!cancelled) setEngineCatalogByPlayerId(merged);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    players,
    league?.playerPool,
    league?.posEligibilityThreshold,
    isCustomPlayer,
  ]);

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

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
    void navigate(`/leagues/${leagueId ?? ""}/command-center`);
  };

  const navigationItems = [
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
                  players={filteredPlayers}
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
                  isCustomPlayer={isCustomPlayer}
                  engineCatalogByPlayerId={engineCatalogByPlayerId}
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
            <div className="coming-soon">
              <h2>Depth Charts</h2>
              <p>Coming soon...</p>
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
    </div>
  );
}