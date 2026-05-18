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

import { useMemo } from "react";
import type { WatchlistPlayer } from "../../api/watchlist";
import { watchlistPrimaryPositionToken } from "../../domain/watchlistDisplayPosition";
import {
  resolveValuationNumber,
  valuationSortLabel,
  valuationTooltip,
  type ValuationSortField,
} from "../../utils/valuation";
import type { BoardValuationUiPhase } from "../../domain/boardValuationFetchPhase";
import { AppSelect, type AppSelectOption } from "../AppSelect";
import { WatchlistTableRow } from "./WatchlistTableRow";
import "./WatchlistTable.css";

type ViewFilter = "all" | "hitters" | "pitchers";
type Priority = "High" | "Medium" | "Low";

const VIEW_FILTER_OPTIONS: AppSelectOption[] = [
  { value: "all", label: "All" },
  { value: "hitters", label: "Hitters" },
  { value: "pitchers", label: "Pitchers" },
];

interface WatchlistTableProps {
  watchlist: WatchlistPlayer[];
  filteredWatchlist: WatchlistPlayer[];
  viewFilter: ViewFilter;
  valuationSortField: ValuationSortField;
  targetOverrides: Record<string, number>;
  targetRaw: Record<string, string>;
  priorityOverrides: Record<string, Priority>;
  /** League roster keys: Pos column shows draftable slots (excludes UTIL/BN/DH). */
  draftDisplaySlotKeys?: string[];
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
  /** Engine board valuation status for watchlist dollar columns. */
  valuationBoardPhase?: BoardValuationUiPhase;
  valuationBoardError?: string | null;
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
  valuationBoardPhase = "ready",
  valuationBoardError = null,
  draftDisplaySlotKeys,
}: WatchlistTableProps) {
  const valuationSortOptions = useMemo<AppSelectOption[]>(
    () =>
      (
        [
          "auction_value",
          "team_value",
          "recommended_bid",
          "baseline_value",
        ] as const
      ).map((field) => ({
        value: field,
        label: valuationSortLabel(field),
      })),
    [],
  );

  return (
    <section className="mydraft-right panel-card">
      <div className="watchlist-head">
        <div>
          <div className="card-label">Strategic Watchlist</div>
          <div className="watchlist-sub">
            {watchlist.length} player{watchlist.length !== 1 ? "s" : ""}
          </div>
          {valuationBoardPhase === "loading" ? (
            <div className="watchlist-engine-hint">Loading Engine valuations…</div>
          ) : null}
          {valuationBoardPhase === "refreshing" ? (
            <div className="watchlist-engine-hint">Updating values…</div>
          ) : null}
          {valuationBoardPhase === "error" ? (
            <div className="watchlist-engine-hint watchlist-engine-hint--error">
              {valuationBoardError ?? "Valuation request failed."}
            </div>
          ) : null}
        </div>

        <div className="watchlist-controls">
          <span>View</span>
          <AppSelect
            className="md-select md-select--compact"
            compact
            value={viewFilter}
            onChange={(v) => onViewFilterChange(v as ViewFilter)}
            options={VIEW_FILTER_OPTIONS}
            aria-label="Watchlist view"
          />
          <span>Sort by</span>
          <AppSelect
            className="md-select md-select--compact"
            compact
            value={valuationSortField}
            onChange={(v) =>
              onValuationSortFieldChange(v as ValuationSortField)
            }
            title="Sort watchlist by valuation signal"
            aria-label="Sort watchlist by valuation"
            options={valuationSortOptions}
          />
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
                  valuationSortField === "team_value"
                    ? resolveValuationNumber(player, "recommended_bid")
                    : valuationSortField === "recommended_bid"
                      ? resolveValuationNumber(player, "team_value")
                      : resolveValuationNumber(player, "recommended_bid");
                const defaultTarget = Math.round(
                  resolveValuationNumber(player, "team_value"),
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
                    draftDisplaySlotKeys={draftDisplaySlotKeys}
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
  const decisionValue = resolveValuationNumber(player, "team_value");
  if (decisionValue >= 45 || player.catalog_tier <= 2) return "High";
  if (decisionValue >= 28 || player.catalog_tier === 3) return "Medium";
  return "Low";
}