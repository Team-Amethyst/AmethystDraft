import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "../hooks/usePageTitle";
import { Database, BarChart3, Layers } from "lucide-react";
import PlayerTable from "../components/PlayerTable";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import "./Research.css";

export default function Research() {
  usePageTitle("Research");
  const [selectedView, setSelectedView] = useState("player-database");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState("adp");
  const [statBasis, setStatBasis] = useState<
    "projections" | "last-year" | "3-year-avg"
  >("projections");
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [playersError, setPlayersError] = useState("");

  useEffect(() => {
    const loadPlayers = async () => {
      setIsLoadingPlayers(true);
      setPlayersError("");

      try {
        const playersFromApi = await getPlayers(
          sortBy as "adp" | "value" | "name",
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
  }, [selectedView, sortBy]);

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      const playerName = player.name?.toLowerCase() ?? "";
      const matchesSearch = playerName.includes(searchQuery.toLowerCase());
      const matchesPosition =
        positionFilter === "all" || player.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [players, searchQuery, positionFilter]);

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
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  statBasis={statBasis}
                  onStatBasisChange={setStatBasis}
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
