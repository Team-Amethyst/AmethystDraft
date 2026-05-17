import { Star } from "lucide-react";
import type { DepthChartPlayerRow, DepthChartPosition } from "../../api/players";
import {
  depthRowMatchBadge,
  formatDepthChartUsageLine,
  type DepthRowMatchState,
} from "../../domain/depthChartRowMatch";

export interface DepthChartSlotViewModel {
  rank: 1 | 2 | 3;
  row: DepthChartPlayerRow | null;
  matchState: DepthRowMatchState | null;
  watchlistEnabled: boolean;
  watchlistStarred: boolean;
}

interface DepthChartPositionCardProps {
  position: DepthChartPosition;
  slots: DepthChartSlotViewModel[];
  onPlayerClick: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
  onStarToggle: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
}

export function DepthChartPositionCard({
  position,
  slots,
  onPlayerClick,
  onStarToggle,
}: DepthChartPositionCardProps) {
  const filled = slots.filter((s) => s.row).length;

  return (
    <section className="depth-position-card">
      <header className="depth-position-card__header">
        <h3 className="depth-position-card__title">{position}</h3>
        <span className="depth-position-card__fill">{filled}/3</span>
      </header>
      <ul className="depth-position-card__list">
        {slots.map((slot) => (
          <DepthChartPlayerRowItem
            key={`${position}-${slot.rank}`}
            position={position}
            slot={slot}
            onPlayerClick={onPlayerClick}
            onStarToggle={onStarToggle}
          />
        ))}
      </ul>
    </section>
  );
}

function DepthChartPlayerRowItem({
  position,
  slot,
  onPlayerClick,
  onStarToggle,
}: {
  position: DepthChartPosition;
  slot: DepthChartSlotViewModel;
  onPlayerClick: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
  onStarToggle: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
}) {
  const { rank, row, matchState, watchlistEnabled, watchlistStarred } = slot;

  if (!row) {
    return (
      <li className="depth-player-row depth-player-row--empty">
        <span className="depth-player-row__rank">#{rank}</span>
        <span className="depth-player-row__empty-label">No assignment</span>
      </li>
    );
  }

  const injured = /injured|\bil\b/i.test(row.status);
  const badge = matchState ? depthRowMatchBadge(matchState) : null;
  const rankTone =
    rank === 1
      ? "depth-player-row--starter"
      : rank === 2
        ? "depth-player-row--backup"
        : "depth-player-row--reserve";

  return (
    <li
      className={`depth-player-row ${rankTone} depth-player-row--clickable ${injured ? "depth-player-row--injured" : ""} ${row.outOfPosition || row.needsManualReview ? "depth-player-row--oof" : ""}`}
    >
      <button
        type="button"
        className="depth-player-row__main"
        onClick={() => onPlayerClick(row, position)}
      >
        <span className="depth-player-row__rank">#{rank}</span>
        <span className="depth-player-row__body">
          <span className="depth-player-row__title-line">
            <span className="depth-player-row__name">{row.playerName}</span>
            <span className="depth-player-row__pos-pill">{row.primaryPosition}</span>
            {injured ? (
              <span className="depth-player-row__badge depth-player-row__badge--injured">
                INJ
              </span>
            ) : null}
            {(row.outOfPosition || row.needsManualReview) && (
              <span className="depth-player-row__badge depth-player-row__badge--oof">
                OOF
              </span>
            )}
          </span>
          <span className="depth-player-row__usage">{formatDepthChartUsageLine(row)}</span>
          {(row.outOfPosition || row.needsManualReview) && (
            <span className="depth-player-row__flag">Manual review suggested</span>
          )}
        </span>
        {badge ? (
          <span
            className={`depth-player-row__badge depth-player-row__badge--${badge.state}`}
          >
            {badge.label}
          </span>
        ) : null}
      </button>
      {watchlistEnabled ? (
        <button
          type="button"
          className={`depth-player-row__star btn-star ${watchlistStarred ? "starred" : ""}`}
          aria-label={
            watchlistStarred
              ? `Remove ${row.playerName} from watchlist`
              : `Add ${row.playerName} to watchlist`
          }
          onClick={(event) => {
            event.stopPropagation();
            onStarToggle(row, position);
          }}
        >
          <Star size={14} fill={watchlistStarred ? "#fbbf24" : "none"} />
        </button>
      ) : null}
    </li>
  );
}
