import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { Database, BarChart3, Layers } from "lucide-react";
import PlayerTable from "../components/PlayerTable";
import type { Player } from "../types/player";
import { getPlayers, getPlayersCached } from "../api/players";
import { getRoster, type RosterEntry } from "../api/roster";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import {
  hasPitcherEligibility,
  normalizePlayerPositions,
} from "../utils/eligibility";
import "./Research.css";

export default function Research() {
  usePageTitle("Research");
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
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
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
    } catch {
      /* noop */
    }
  }, [positionFilter]);
  useEffect(() => {
    try {
      localStorage.setItem("amethyst-research-statbasis", statBasis);
    } catch {
      /* noop */
    }
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

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
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
  }, [players, searchQuery, positionFilter]);

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
    void navigate(`/leagues/${leagueId ?? ""}/command-center`);
  };

  const navigationItems = [
    { id: "player-database", label: "Players", icon: Database },
    { id: "tiers", label: "Tiers", icon: BarChart3 },
    { id: "depth-charts", label: "Depth Charts", icon: Layers },
  ];

  return (
    <div className="research-page">
      <div className="research-layout">
        {/* Top Navigation Tabs */}
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
        </div>

        <div className="research-content">
          {selectedView === "player-database" && (
            <>
              {playersError && <p className="research-error">{playersError}</p>}
              {isLoadingPlayers ? (
                <div className="coming-soon">
                  <h2>Loading Players</h2>
                  <p>Fetching player data from MongoDB...</p>
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
    </div>
  );
}
