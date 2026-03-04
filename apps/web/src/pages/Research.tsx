import { useEffect, useMemo, useState } from "react";
import AuthNavbar from "../components/AuthNavbar";
import ResearchSidebar from "../components/ResearchSidebar";
import PlayerTable from "../components/PlayerTable";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import "./Research.css";

export default function Research() {
  const [selectedView, setSelectedView] = useState("player-database");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState("adp");
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [playersError, setPlayersError] = useState("");

  useEffect(() => {
    const loadPlayers = async () => {
      setIsLoadingPlayers(true);
      setPlayersError("");

      try {
        const playersFromApi = await getPlayers(sortBy as "adp" | "value" | "name");
        setPlayers(playersFromApi);
      } catch (err) {
        setPlayersError(err instanceof Error ? err.message : "Failed to load players");
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
      const matchesPosition = positionFilter === "all" || player.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [players, searchQuery, positionFilter]);

  return (
    <div className="research-page">
      <AuthNavbar />
      <div className="research-layout">
        <ResearchSidebar selectedView={selectedView} onSelectView={setSelectedView} />
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
                />
              )}
            </>
          )}
          {selectedView === "watchlists" && (
            <div className="coming-soon">
              <h2>Watchlists</h2>
              <p>Coming soon...</p>
            </div>
          )}
          {selectedView === "rankings" && (
            <div className="coming-soon">
              <h2>Rankings</h2>
              <p>Coming soon...</p>
            </div>
          )}
          {selectedView === "compare" && (
            <div className="coming-soon">
              <h2>Compare</h2>
              <p>Coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
