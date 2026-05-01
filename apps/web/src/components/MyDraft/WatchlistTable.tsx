/**
 * WatchlistTable
 *
 * Renders the strategic watchlist with target price editing, priority selection,
 * per-player notes, and remove/navigate actions.
 *
 * Design Pattern: Observer — subscribes to watchlist, notes, and targetOverrides
 *   subjects via props; notifies MyDraft of changes through callbacks.
 * Design Principle: Single Responsibility — exclusively handles watchlist display
 *   and interaction. No budget or position logic lives here.
 */

import { Minus, Plus, Star, X } from "lucide-react";
import type { WatchlistPlayer } from "../../api/watchlist";
import PosBadge from "../PosBadge";
import {
  formatDollar,
  resolveValuationNumber,
  valuationSortLabel,
  valuationTooltip,
  type ValuationSortField,
} from "../../utils/valuation";

type ViewFilter = "all" | "hitters" | "pitchers";
type Priority = "High" | "Medium" | "Low";

interface WatchlistTableProps {
  watchlist: WatchlistPlayer[];
  filteredWatchlist: WatchlistPlayer[];
  viewFilter: ViewFilter;
  valuationSortField: ValuationSortField;
  targetOverrides: Record<string, number>;
  targetRaw: Record<string, string>;
  priorityOverrides: Record<string, Priority>;
  getNote: (id: string) => string;
  onViewFilterChange: (filter: ViewFilter) => void;
  onValuationSortFieldChange: (field: ValuationSortField) => void;
  onTargetChange: (playerId: string, raw: string, value: number | null) => void;
  onTargetBlur: (playerId: string, displayVal: string, defaultTarget: number) => void;
  onTargetStep: (playerId: string, delta: 1 | -1, current: number) => void;
  onPriorityChange: (playerId: string, priority: Priority) => void;
  onNoteChange: (playerId: string, note: string) => void;
  onRemove: (playerId: string) => void;
  onRowClick: (playerId: string) => void;
}

function normalizePosition(position: string): string {
  return (
    position.toUpperCase().replace(/\s+/g, "").split(/[/,|-]/)[0] || "UTIL"
  );
}

export default function WatchlistTable({
  watchlist,
  filteredWatchlist,
  viewFilter,
  valuationSortField,
  targetOverrides,
  targetRaw,
  priorityOverrides,
  getNote,
  onViewFilterChange,
  onValuationSortFieldChange,
  onTargetChange,
  onTargetBlur,
  onTargetStep,
  onPriorityChange,
  onNoteChange,
  onRemove,
  onRowClick,
}: WatchlistTableProps) {
  return (
    <section className="mydraft-right panel-card">
      <div className="watchlist-head">
        <div>
          <div className="card-label">Strategic Watchlist</div>
          <div className="watchlist-sub">
            {watchlist.length} player{watchlist.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="watchlist-controls">
          <span>View</span>
          <select
            className="md-select md-select--compact"
            value={viewFilter}
            onChange={(e) => onViewFilterChange(e.target.value as ViewFilter)}
          >
            <option value="all">All</option>
            <option value="hitters">Hitters</option>
            <option value="pitchers">Pitchers</option>
          </select>
          <span>Sort by</span>
          <select
            className="md-select md-select--compact"
            value={valuationSortField}
            onChange={(e) =>
              onValuationSortFieldChange(e.target.value as ValuationSortField)
            }
            title="Sort watchlist by valuation signal"
          >
            <option value="team_adjusted_value">Your Value</option>
            <option value="recommended_bid">Likely Bid</option>
            <option value="adjusted_value">Market Value</option>
            <option value="baseline_value">Player Strength</option>
          </select>
        </div>
      </div>

      <div className="watchlist-scroll">
        <table className="watchlist-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th title={valuationTooltip(valuationSortField)}>
                {valuationSortField === "team_adjusted_value"
                  ? "Your Value"
                  : valuationSortField === "recommended_bid"
                    ? "Likely Bid"
                    : valuationSortField === "adjusted_value"
                      ? "Market Value"
                      : "Player Strength"}
              </th>
              <th>Target $</th>
              <th>Priority</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredWatchlist.length === 0 ? (
              <tr>
                <td colSpan={7} className="watchlist-empty">
                  Star players in Research to populate this watchlist.
                </td>
              </tr>
            ) : (
              filteredWatchlist.map((player) => {
                const pos = normalizePosition(player.position || "UTIL");
                const primary = resolveValuationNumber(player, valuationSortField);
                const supporting =
                  valuationSortField === "team_adjusted_value"
                    ? resolveValuationNumber(player, "recommended_bid")
                    : resolveValuationNumber(player, "team_adjusted_value");
                const defaultTarget = Math.round(
                  resolveValuationNumber(player, "team_adjusted_value"),
                );
                const targetVal = targetOverrides[player.id] ?? defaultTarget;
                const priority: Priority =
                  priorityOverrides[player.id] ?? derivePriority(player);
                const displayVal =
                  player.id in targetRaw
                    ? targetRaw[player.id]
                    : String(targetVal);

                return (
                  <tr
                    key={player.id}
                    className="watchlist-row watchlist-row--clickable"
                    onClick={() => onRowClick(player.id)}
                  >
                    <td>
                      <div className="player-main">
                        <Star size={12} className="row-star" fill="#facc15" />
                        <div className="player-name-row">
                          <span className="player-name">{player.name}</span>
                          <span className="player-team">
                            {player.team || "--"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      {player.positions && player.positions.length > 1 ? (
                        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
                          {player.positions.map((p) => (
                            <PosBadge key={p} pos={p} />
                          ))}
                        </div>
                      ) : (
                        <PosBadge pos={pos} />
                      )}
                    </td>

                    <td
                      className="money"
                      title={
                        valuationTooltip(valuationSortField)
                      }
                    >
                      {formatDollar(primary)}
                      <div
                        style={{
                          fontSize: "0.62rem",
                          opacity: 0.78,
                          lineHeight: 1.1,
                          marginTop: "1px",
                        }}
                      >
                        {valuationSortLabel(
                          valuationSortField === "team_adjusted_value"
                            ? "recommended_bid"
                            : "team_adjusted_value",
                        )}
                        : {formatDollar(supporting)}
                      </div>
                    </td>

                    {/* Target $ — stop propagation so clicks don't navigate */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="target-input-group">
                        <button
                          className="target-stepper"
                          type="button"
                          onClick={() => onTargetStep(player.id, -1, targetVal)}
                        >
                          <Minus size={9} />
                        </button>
                        <span className="target-prefix">$</span>
                        <input
                          className="target-input"
                          type="text"
                          inputMode="numeric"
                          value={displayVal}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            const v = parseInt(raw);
                            onTargetChange(player.id, raw, isNaN(v) ? null : v);
                          }}
                          onBlur={() =>
                            onTargetBlur(player.id, displayVal, defaultTarget)
                          }
                        />
                        <button
                          className="target-stepper"
                          type="button"
                          onClick={() => onTargetStep(player.id, 1, targetVal)}
                        >
                          <Plus size={9} />
                        </button>
                      </div>
                    </td>

                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`md-select md-select--priority priority-select ${priority.toLowerCase()}`}
                        value={priority}
                        onChange={(e) =>
                          onPriorityChange(
                            player.id,
                            e.target.value as Priority,
                          )
                        }
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </td>

                    <td className="td-note" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="watchlist-note-input"
                        value={getNote(player.id)}
                        onChange={(e) => onNoteChange(player.id, e.target.value)}
                        placeholder="Note..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>

                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="unstar-btn"
                        type="button"
                        onClick={() => onRemove(player.id)}
                        title="Remove from watchlist"
                      >
                        <X size={13} strokeWidth={2.4} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Moved out of MyDraft — priority derivation belongs with the watchlist display logic
function derivePriority(player: WatchlistPlayer): Priority {
  // TODO(logic): Replace with backend scoring/recommendation priority.
  const decisionValue = resolveValuationNumber(player, "team_adjusted_value");
  if (decisionValue >= 45 || player.tier <= 2) return "High";
  if (decisionValue >= 28 || player.tier === 3) return "Medium";
  return "Low";
}