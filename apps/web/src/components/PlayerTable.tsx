// import { Search, Star } from "lucide-react";
// import type { Player } from "../types/player";
// import { useWatchlist } from "../contexts/WatchlistContext";
// import "./PlayerTable.css";

// interface PlayerTableProps {
//   players: Player[];
//   searchQuery: string;
//   onSearchChange: (query: string) => void;
//   positionFilter: string;
//   onPositionChange: (position: string) => void;
//   sortBy: string;
//   onSortChange: (sort: string) => void;
//   statBasis?: "projections" | "last-year" | "3-year-avg";
// }

// export default function PlayerTable({
//   players,
//   searchQuery,
//   onSearchChange,
//   positionFilter,
//   onPositionChange,
//   sortBy,
//   onSortChange,
//   statBasis = "projections",
// }: PlayerTableProps) {
//   const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

//   const positions = ["all", "OF", "SS", "1B", "2B", "3B", "C", "DH", "SP", "RP", "UTIL"];

//   const toggleWatchlist = (player: Player) => {
//     if (isInWatchlist(player.id)) {
//       removeFromWatchlist(player.id);
//     } else {
//       addToWatchlist(player);
//     }
//   };

//   const getCategoryTags = (player: Player) => {
//     const tags: string[] = [];
    
//     // Use appropriate data source based on stat basis
//     const useProjections = statBasis === "projections" || statBasis === "3-year-avg";
//     const battingData = useProjections ? player.projection?.batting : player.stats?.batting;
//     const pitchingData = useProjections ? player.projection?.pitching : player.stats?.pitching;
    
//     if (battingData) {
//       const { hr = 0, sb = 0, avg = "0", runs = 0, rbi = 0 } = battingData;
//       if (hr >= 30) tags.push("HR+");
//       if (sb >= 20) tags.push("SB+");
//       if (parseFloat(avg) >= 0.290) tags.push("AVG+");
//       if (runs >= 100) tags.push("R+");
//       if (rbi >= 100) tags.push("RBI+");
//     }

//     if (pitchingData) {
//       const { strikeouts = 0, wins = 0, saves = 0 } = pitchingData;
//       if (strikeouts >= 200) tags.push("K+");
//       if (wins >= 12) tags.push("W+");
//       if (saves >= 25) tags.push("SV+");
//     }

//     return tags;
//   };

//   return (
//     <div className="player-table-container">
//       <div className="player-table-controls">
//         <div className="search-bar">
//           <Search size={18} />
//           <input
//             type="text"
//             placeholder="Search players..."
//             value={searchQuery}
//             onChange={(e) => onSearchChange(e.target.value)}
//           />
//         </div>
        
//         <div className="table-filters">
//           <select
//             className="filter-select"
//             value={positionFilter}
//             onChange={(e) => onPositionChange(e.target.value)}
//           >
//             <option value="all">All Positions</option>
//             {positions.slice(1).map((pos) => (
//               <option key={pos} value={pos}>{pos}</option>
//             ))}
//           </select>

//           <select
//             className="filter-select"
//             value={sortBy}
//             onChange={(e) => onSortChange(e.target.value)}
//           >
//             <option value="adp">Sort: ADP</option>
//             <option value="value">Sort: Value</option>
//             <option value="name">Sort: Name</option>
//           </select>

//           <button className="btn-proj active">
//             {statBasis === "projections" ? "PROJ" : statBasis === "last-year" ? "2025" : "3YR"}
//           </button>
//         </div>
//       </div>

//       <div className="player-table-wrapper">
//         <table className="player-table">
//           <thead>
//             <tr>
//               <th className="col-rank">#</th>
//               <th className="col-player">PLAYER</th>
//               <th className="col-pos">POS</th>
//               <th className="col-team">TEAM</th>
//               <th className="col-proj">PROJ</th>
//               <th className="col-value">VALUE</th>
//               <th className="col-categories">CATEGORIES</th>
//               <th className="col-star"></th>
//             </tr>
//           </thead>
//           <tbody>
//             {players.map((player, index) => {
//               const categoryTags = getCategoryTags(player);
//               const isStarred = isInWatchlist(player.id);

//               return (
//                 <tr key={player.id} className="player-row">
//                   <td className="col-rank">{index + 1}</td>
//                   <td className="col-player">
//                     <span className="player-name">{player.name}</span>
//                   </td>
//                   <td className="col-pos">{player.position}</td>
//                   <td className="col-team">{player.team}</td>
//                   <td className="col-proj">{Number.isFinite(player.adp) ? Math.round(player.adp * 10) : "-"}</td>
//                   <td className="col-value">
//                     <span className="value-amount">${Number.isFinite(player.value) ? player.value : 0}</span>
//                   </td>
//                   <td className="col-categories">
//                     <div className="category-tags">
//                       {categoryTags.map((tag) => (
//                         <span key={tag} className="category-tag">
//                           {tag}
//                         </span>
//                       ))}
//                     </div>
//                   </td>
//                   <td className="col-star">
//                     <button
//                       className={`btn-star ${isStarred ? "starred" : ""}`}
//                       onClick={() => toggleWatchlist(player)}
//                     >
//                       <Star size={16} fill={isStarred ? "#fbbf24" : "none"} />
//                     </button>
//                   </td>
//                 </tr>
//               );
//             })}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }


import { useState } from "react";
import { Search, Star, RotateCcw } from "lucide-react";
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
  statBasis?: "projections" | "last-year" | "3-year-avg";
  onStatBasisChange?: (basis: "projections" | "last-year" | "3-year-avg") => void;
}

const POSITIONS = ["all", "OF", "SS", "1B", "2B", "3B", "C", "DH", "SP", "RP"];

const TIER_COLORS: Record<number, string> = {
  1: "#a855f7",
  2: "#6366f1",
  3: "#22c55e",
  4: "#f59e0b",
  5: "#6b7280",
};

function TierBadge({ tier }: { tier: number }) {
  return (
    <span
      className="tier-badge"
      style={{ background: TIER_COLORS[tier] ?? "#6b7280" }}
    >
      {tier}
    </span>
  );
}

function PlayerHeadshot({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (failed) {
    return <div className="headshot-fallback">{initials}</div>;
  }
  return (
    <img
      src={src}
      alt={name}
      className="player-headshot"
      onError={() => setFailed(true)}
    />
  );
}

function getCategoryTags(player: Player, statBasis: string): string[] {
  const tags: string[] = [];
  const useProjections = statBasis === "projections" || statBasis === "3-year-avg";
  const bat = useProjections ? player.projection?.batting : player.stats?.batting;
  const pit = useProjections ? player.projection?.pitching : player.stats?.pitching;

  if (bat) {
    if (bat.hr >= 30) tags.push("HR+");
    if (bat.sb >= 20) tags.push("SB+");
    if (parseFloat(bat.avg) >= 0.290) tags.push("AVG+");
    if (bat.runs >= 100) tags.push("R+");
    if (bat.rbi >= 100) tags.push("RBI+");
  }
  if (pit) {
    if (pit.strikeouts >= 200) tags.push("K+");
    if (pit.wins >= 12) tags.push("W+");
    if (pit.saves >= 25) tags.push("SV+");
  }
  return tags;
}

function getValDiff(player: Player): number {
  // Val diff = projected value vs ADP-implied value (placeholder: value - adp-based estimate)
  const adpValue = Math.max(1, Math.round(50 - player.adp * 0.3));
  return player.value - adpValue;
}

// function formatStat(player: Player, statBasis: string): string {
//   const useProjections = statBasis === "projections" || statBasis === "3-year-avg";
//   const bat = useProjections ? player.projection?.batting : player.stats?.batting;
//   const pit = useProjections ? player.projection?.pitching : player.stats?.pitching;
//   if (bat) return bat.avg;
//   if (pit) return pit.era;
//   return "-";
// }

export default function PlayerTable({
  players,
  searchQuery,
  onSearchChange,
  positionFilter,
  onPositionChange,
  sortBy,
  onSortChange,
  statBasis = "projections",
  onStatBasisChange,
}: PlayerTableProps) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [starredOnly, setStarredOnly] = useState(false);

  const toggleWatchlist = (player: Player) => {
    if (isInWatchlist(player.id)) removeFromWatchlist(player.id);
    else addToWatchlist(player);
  };

  const statBasisLabel = statBasis === "projections" ? "PROJ" : statBasis === "last-year" ? "2024" : "3YR";

  const displayed = starredOnly ? players.filter(p => isInWatchlist(p.id)) : players;

  return (
    <div className="pt-container">

      {/* ── Top controls bar ── */}
      <div className="pt-controls">
        <div className="pt-search">
          <Search size={15} className="pt-search-icon" />
          <input
            type="text"
            placeholder="Search players by name..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pt-search-input"
          />
        </div>

        <div className="pt-filters">
          <select className="pt-select" value={positionFilter} onChange={e => onPositionChange(e.target.value)}>
            <option value="all">Position (All)</option>
            {POSITIONS.slice(1).map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select className="pt-select" value={sortBy} onChange={e => onSortChange(e.target.value)}>
            <option value="value">Sort: Value</option>
            <option value="adp">Sort: ADP</option>
            <option value="name">Sort: Name</option>
          </select>

          <button
            className={"pt-toggle " + (starredOnly ? "active" : "")}
            onClick={() => setStarredOnly(v => !v)}
          >
            <Star size={13} fill={starredOnly ? "#fbbf24" : "none"} />
            Starred only
          </button>

          {onStatBasisChange && (
            <div className="pt-basis-pills">
              {(["projections", "last-year", "3-year-avg"] as const).map(b => (
                <button
                  key={b}
                  className={"pt-pill " + (statBasis === b ? "active" : "")}
                  onClick={() => onStatBasisChange(b)}
                >
                  {b === "projections" ? "PROJ" : b === "last-year" ? "2024" : "3YR"}
                </button>
              ))}
            </div>
          )}

          <button className="pt-icon-btn" title="Reset filters" onClick={() => { onSearchChange(""); onPositionChange("all"); }}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th className="th-rank">Rank</th>
              <th className="th-player">Player</th>
              <th className="th-pos">Pos</th>
              <th className="th-team">Team</th>
              <th className="th-tier">Tier</th>
              <th className="th-adp">ADP</th>
              <th className="th-value">Proj $</th>
              <th className="th-valdiff">Val Diff</th>
              <th className="th-avg">AVG/ERA</th>
              <th className="th-stat">HR/K</th>
              <th className="th-stat">RBI/W</th>
              <th className="th-stat">R/SV</th>
              <th className="th-stat">SB/WHIP</th>
              <th className="th-tags">Tags</th>
              <th className="th-star"></th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr>
                <td colSpan={15} className="pt-empty">No players found.</td>
              </tr>
            )}
            {displayed.map((player, index) => {
              const tags = getCategoryTags(player, statBasis);
              const valDiff = getValDiff(player);
              const isStarred = isInWatchlist(player.id);
              const isBatter = !!player.stats?.batting || !!player.projection?.batting;
              const useProjections = statBasis === "projections" || statBasis === "3-year-avg";
              const bat = useProjections ? player.projection?.batting : player.stats?.batting;
              const pit = useProjections ? player.projection?.pitching : player.stats?.pitching;

              return (
                <tr key={player.id} className={"pt-row" + (isStarred ? " pt-row--starred" : "")}>
                  <td className="td-rank">{index + 1}</td>

                  <td className="td-player">
                    <div className="player-cell">
                      <PlayerHeadshot src={player.headshot} name={player.name} />
                      <span className="player-name">{player.name}</span>
                    </div>
                  </td>

                  <td className="td-pos">{player.position}</td>
                  <td className="td-team">{player.team}</td>

                  <td className="td-tier">
                    <TierBadge tier={player.tier} />
                  </td>

                  <td className="td-adp">{player.adp}</td>

                  <td className="td-value">
                    <span className="value-chip">${player.value}</span>
                  </td>

                  <td className={"td-valdiff " + (valDiff >= 0 ? "pos" : "neg")}>
                    {valDiff >= 0 ? "+" : ""}{valDiff}
                  </td>

                  <td className="td-stat">{isBatter ? bat?.avg ?? "-" : pit?.era ?? "-"}</td>
                  <td className="td-stat">{isBatter ? (bat?.hr ?? "-") : (pit?.strikeouts ?? "-")}</td>
                  <td className="td-stat">{isBatter ? (bat?.rbi ?? "-") : (pit?.wins ?? "-")}</td>
                  <td className="td-stat">{isBatter ? (bat?.runs ?? "-") : (pit?.saves ?? "-")}</td>
                  <td className="td-stat">{isBatter ? (bat?.sb ?? "-") : (pit?.whip ?? "-")}</td>

                  <td className="td-tags">
                    <div className="tag-list">
                      {tags.map(t => <span key={t} className="tag">{t}</span>)}
                    </div>
                  </td>

                  <td className="td-star">
                    <button
                      className={"btn-star " + (isStarred ? "starred" : "")}
                      onClick={() => toggleWatchlist(player)}
                      title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
                    >
                      <Star size={15} fill={isStarred ? "#fbbf24" : "none"} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pt-footer">
        Showing {displayed.length} players · {statBasisLabel} stats · Data via MLB Stats API
      </div>
    </div>
  );
}