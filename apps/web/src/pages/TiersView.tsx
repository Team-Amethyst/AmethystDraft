import { useMemo, useState } from "react";
import type { Player } from "../types/player";
import "./TiersView.css";
import { groupPlayersByTier, calculateTierStats, sortPlayersByValue, formatCurrency } from "../utils/tiers";

type Props = {
  players: Player[];
  onPlayerClick: (p: Player) => void;
  onMoveToCommandCenter: (p: Player) => void;
  isInWatchlist: (id: string) => boolean;
  addToWatchlist: (p: Player) => void;
  removeFromWatchlist: (id: string) => void;
  getNote?: (playerId: string) => string;
  onNoteChange?: (playerId: string, note: string) => void;
  isCustomPlayer?: (id: string) => boolean;
};

function TierBadge({ tier }: { tier: string | number }) {
  return <span className={`tier-badge tier-${tier}`}>{tier}</span>;
}

export default function TiersView({
  players,
  onPlayerClick,
  onMoveToCommandCenter,
  isInWatchlist,
  addToWatchlist,
  removeFromWatchlist,
}: Props) {
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recommended_bid" | "team_adjusted_value">("recommended_bid");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    initial["1"] = true;
    initial["2"] = true;
    return initial;
  });

  const draftedIds = useMemo(() => new Set<string>(), []);
  const groups = useMemo(() => groupPlayersByTier(players), [players]);
  const stats = useMemo(() => calculateTierStats(groups, draftedIds), [groups, draftedIds]);

  const filteredStats = useMemo(() => {
    if (positionFilter === "all") return stats;
    return stats.map((s) => ({
      ...s,
      players: s.players.filter((p) => p.position === positionFilter),
      positionCounts: positionFilter in s.positionCounts 
        ? { [positionFilter]: s.positionCounts[positionFilter] }
        : {},
    })).filter((s) => s.players.length > 0);
  }, [stats, positionFilter]);

  const sortedStats = useMemo(() => {
    return filteredStats.map((s) => ({
      ...s,
      players: sortPlayersByValue(s.players, sortBy),
    }));
  }, [filteredStats, sortBy]);

  const uniquePositions = useMemo(() => {
    const pos = new Set<string>();
    for (const p of players) {
      if (p.position) pos.add(p.position);
    }
    return Array.from(pos).sort();
  }, [players]);

  return (
    <div className="tiers-view">
      <div className="tiers-header">
        <div>
          <h2>Tiers</h2>
          <p>Strategic tier breakdown with position scarcity and value cliffs to guide draft decisions</p>
        </div>

        <div className="tiers-controls">
          <div className="tiers-control-group">
            <label htmlFor="position-filter">Position</label>
            <select
              id="position-filter"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
            >
              <option value="all">All Positions</option>
              {uniquePositions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          <div className="tiers-control-group">
            <label htmlFor="sort-by">Sort By</label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="recommended_bid">Likely Bid</option>
              <option value="team_adjusted_value">Your Value</option>
            </select>
          </div>
        </div>
      </div>

      <div className="tiers-list">
        {sortedStats.map((tierStat) => (
          <section key={String(tierStat.tier)} className="tier-group">
            <div className="tier-group__header">
              <div className="tier-group__header-left">
                <div className="tier-header-badge">
                  <TierBadge tier={tierStat.tier} />
                  <span className="tier-available">
                    {tierStat.availableCount}/{tierStat.players.length}
                  </span>
                </div>

                <div className="tier-header-stats">
                  <span className="tier-stat">
                    {formatCurrency(tierStat.averageValue)} avg
                  </span>
                  {tierStat.valueCliffFromPrevious !== null && (
                    <span className={`tier-cliff ${tierStat.valueCliffFromPrevious > 10 ? "is-large" : ""}`}>
                      ↓ {formatCurrency(tierStat.valueCliffFromPrevious)} cliff
                    </span>
                  )}
                </div>
              </div>

              <div className="tier-header-positions">
                {Object.entries(tierStat.positionCounts)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([pos, count]) => (
                    <span key={pos} className="position-badge">
                      {pos} <strong>{count}</strong>
                    </span>
                  ))}
              </div>

              <button
                type="button"
                className="tier-toggle"
                onClick={() =>
                  setExpanded((s) => ({ ...s, [String(tierStat.tier)]: !s[String(tierStat.tier)] }))
                }
              >
                {expanded[String(tierStat.tier)] ? "Collapse" : "Expand"}
              </button>
            </div>

            {expanded[String(tierStat.tier)] && (
              <div className="tier-group__body">
                {tierStat.players.map((player) => {
                  const isDrafted = draftedIds.has(player.id) || draftedIds.has(String(player.mlbId));
                  const value = player.team_adjusted_value ?? player.recommended_bid ?? player.adjusted_value ?? 0;

                  return (
                    <div
                      key={player.id}
                      className={`tier-player-row ${isDrafted ? "tier-player-row--drafted" : ""}`}
                    >
                      <div
                        className="tier-player-row__main"
                        onClick={() => onPlayerClick(player)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onPlayerClick(player);
                          }
                        }}
                      >
                        <div>
                          <div className="tier-player-row__name">{player.name}</div>
                          <div className="tier-player-row__meta">
                            <span className="chip">{player.position}</span>
                            <span className="chip">{player.team}</span>
                          </div>
                        </div>
                      </div>

                      <div className="tier-player-row__value">
                        <span className="value-display">{formatCurrency(value)}</span>
                      </div>

                      <div className="tier-player-row__actions">
                        <button
                          type="button"
                          className={`btn-star ${isInWatchlist(player.id) ? "starred" : ""}`}
                          aria-label={isInWatchlist(player.id) ? `Remove ${player.name} from watchlist` : `Add ${player.name} to watchlist`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isInWatchlist(player.id)) removeFromWatchlist(player.id);
                            else addToWatchlist(player);
                          }}
                        >
                          ★
                        </button>

                        <button
                          type="button"
                          className="btn-move"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToCommandCenter(player);
                          }}
                        >
                          Move
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
