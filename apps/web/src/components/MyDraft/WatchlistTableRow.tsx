import { Minus, Plus, Star, X } from "lucide-react";
import type { WatchlistPlayer } from "../../api/watchlist";
import PosBadge from "../PosBadge";
import {
  formatDollar,
  valuationSortLabel,
  valuationTooltip,
  type ValuationSortField,
} from "../../utils/valuation";

type Priority = "High" | "Medium" | "Low";

export interface WatchlistTableRowModel {
  player: WatchlistPlayer;
  pos: string;
  primary: number;
  supporting: number;
  defaultTarget: number;
  targetVal: number;
  priority: Priority;
  displayVal: string;
}

interface WatchlistTableRowProps {
  model: WatchlistTableRowModel;
  valuationSortField: ValuationSortField;
  getNote: (id: string) => string;
  onRowClick: (playerId: string) => void;
  onTargetChange: (playerId: string, raw: string, value: number | null) => void;
  onTargetBlur: (
    playerId: string,
    displayVal: string,
    defaultTarget: number,
  ) => void;
  onTargetStep: (playerId: string, delta: 1 | -1, current: number) => void;
  onPriorityChange: (playerId: string, priority: Priority) => void;
  onNoteChange: (playerId: string, note: string) => void;
  onRemove: (playerId: string) => void;
}

export function WatchlistTableRow({
  model,
  valuationSortField,
  getNote,
  onRowClick,
  onTargetChange,
  onTargetBlur,
  onTargetStep,
  onPriorityChange,
  onNoteChange,
  onRemove,
}: WatchlistTableRowProps) {
  const { player, pos, primary, supporting, defaultTarget, targetVal, priority, displayVal } =
    model;

  return (
    <tr
      className="watchlist-row watchlist-row--clickable"
      onClick={() => onRowClick(player.id)}
    >
      <td>
        <div className="player-main">
          <Star size={12} className="row-star" fill="#facc15" />
          <div className="player-name-row">
            <span className="player-name">{player.name}</span>
            <span className="player-team">{player.team || "--"}</span>
          </div>
        </div>
      </td>

      <td>
        {player.positions && player.positions.length > 1 ? (
          <div className="watchlist-pos-badges">
            {player.positions.map((p) => (
              <PosBadge key={p} pos={p} />
            ))}
          </div>
        ) : (
          <PosBadge pos={pos} />
        )}
      </td>

      <td className="money" title={valuationTooltip(valuationSortField)}>
        {formatDollar(primary)}
        <div className="watchlist-supporting-value">
          {valuationSortLabel(
            valuationSortField === "team_adjusted_value"
              ? "recommended_bid"
              : "team_adjusted_value",
          )}
          : {formatDollar(supporting)}
        </div>
      </td>

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
            onBlur={() => onTargetBlur(player.id, displayVal, defaultTarget)}
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
            onPriorityChange(player.id, e.target.value as Priority)
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
}
