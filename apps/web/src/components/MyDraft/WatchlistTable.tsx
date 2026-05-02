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

import type { WatchlistPlayer } from "../../api/watchlist";
import { watchlistPrimaryPositionToken } from "../../domain/watchlistDisplayPosition";
import {
  resolveValuationNumber,
  valuationSortLabel,
  valuationTooltip,
  type ValuationSortField,
} from "../../utils/valuation";
import { WatchlistTableRow } from "./WatchlistTableRow";
import "./WatchlistTable.css";

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
            <option value="team_adjusted_value">
              {valuationSortLabel("team_adjusted_value")}
            </option>
            <option value="recommended_bid">
              {valuationSortLabel("recommended_bid")}
            </option>
            <option value="adjusted_value">
              {valuationSortLabel("adjusted_value")}
            </option>
            <option value="baseline_value">
              {valuationSortLabel("baseline_value")}
            </option>
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
                {valuationSortLabel(valuationSortField)}
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
                const pos = watchlistPrimaryPositionToken(
                  player.position || "UTIL",
                );
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
                  <WatchlistTableRow
                    key={player.id}
                    model={{
                      player,
                      pos,
                      primary,
                      supporting,
                      defaultTarget,
                      targetVal,
                      priority,
                      displayVal,
                    }}
                    valuationSortField={valuationSortField}
                    getNote={getNote}
                    onRowClick={onRowClick}
                    onTargetChange={onTargetChange}
                    onTargetBlur={onTargetBlur}
                    onTargetStep={onTargetStep}
                    onPriorityChange={onPriorityChange}
                    onNoteChange={onNoteChange}
                    onRemove={onRemove}
                  />
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