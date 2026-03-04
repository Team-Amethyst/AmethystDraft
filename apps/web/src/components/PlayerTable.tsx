import { Search, Star } from "lucide-react";
import type { Player } from "../types/player";
import { useWatchlist } from "../contexts/WatchlistContext";
import "./PlayerTable.css";

interface PlayerTableProps {
  players: Player[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  positionFilter: string;
  onPositionChange: (position: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

export default function PlayerTable({
  players,
  searchQuery,
  onSearchChange,
  positionFilter,
  onPositionChange,
  sortBy,
  onSortChange,
}: PlayerTableProps) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

  const positions = ["all", "OF", "SS", "1B", "2B", "3B", "C", "DH", "SP", "RP", "UTIL"];

  const toggleWatchlist = (player: Player) => {
    if (isInWatchlist(player.id)) {
      removeFromWatchlist(player.id);
    } else {
      addToWatchlist(player);
    }
  };

  const getCategoryTags = (player: Player) => {
    const tags: string[] = [];
    
    if (player.projection?.batting) {
      const { hr = 0, sb = 0, avg = "0", runs = 0, rbi = 0 } = player.projection.batting;
      if (hr >= 30) tags.push("HR+");
      if (sb >= 20) tags.push("SB+");
      if (parseFloat(avg) >= 0.290) tags.push("AVG+");
      if (runs >= 100) tags.push("R+");
      if (rbi >= 100) tags.push("RBI+");
    }

    if (player.projection?.pitching) {
      const { strikeouts = 0, wins = 0, saves = 0 } = player.projection.pitching;
      if (strikeouts >= 200) tags.push("K+");
      if (wins >= 12) tags.push("W+");
      if (saves >= 25) tags.push("SV+");
    }

    return tags;
  };

  return (
    <div className="player-table-container">
      <div className="player-table-controls">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        
        <div className="table-filters">
          <select
            className="filter-select"
            value={positionFilter}
            onChange={(e) => onPositionChange(e.target.value)}
          >
            <option value="all">All Positions</option>
            {positions.slice(1).map((pos) => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="adp">Sort: ADP</option>
            <option value="value">Sort: Value</option>
            <option value="name">Sort: Name</option>
          </select>

          <button className="btn-proj active">PROJ</button>
        </div>
      </div>

      <div className="player-table-wrapper">
        <table className="player-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-player">PLAYER</th>
              <th className="col-pos">POS</th>
              <th className="col-team">TEAM</th>
              <th className="col-proj">PROJ</th>
              <th className="col-value">VALUE</th>
              <th className="col-categories">CATEGORIES</th>
              <th className="col-star"></th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const categoryTags = getCategoryTags(player);
              const isStarred = isInWatchlist(player.id);

              return (
                <tr key={player.id} className="player-row">
                  <td className="col-rank">{index + 1}</td>
                  <td className="col-player">
                    <span className="player-name">{player.name}</span>
                  </td>
                  <td className="col-pos">{player.position}</td>
                  <td className="col-team">{player.team}</td>
                  <td className="col-proj">{Number.isFinite(player.adp) ? Math.round(player.adp * 10) : "-"}</td>
                  <td className="col-value">
                    <span className="value-amount">${Number.isFinite(player.value) ? player.value : 0}</span>
                  </td>
                  <td className="col-categories">
                    <div className="category-tags">
                      {categoryTags.map((tag) => (
                        <span key={tag} className="category-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="col-star">
                    <button
                      className={`btn-star ${isStarred ? "starred" : ""}`}
                      onClick={() => toggleWatchlist(player)}
                    >
                      <Star size={16} fill={isStarred ? "#fbbf24" : "none"} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
