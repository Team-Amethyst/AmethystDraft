import { Star } from "lucide-react";
import type { DepthChartPlayerRow, DepthChartPosition } from "../../api/players";
import type { Player } from "../../types/player";
import type { DepthRowMatchState, DepthRowRightDisplay } from "../../domain/depthChartRowMatch";
import { playerDisplayPositionBadges } from "../../utils/eligibility";
import { POSITION_LABELS } from "../../features/leagues/shared";
import PosBadge from "../PosBadge";
import { PlayerHeadshot } from "../PlayerTableParts";

export interface DepthChartSlotViewModel {
  rank: 1 | 2 | 3;
  row: DepthChartPlayerRow | null;
  catalogPlayer: Player | null;
  matchState: DepthRowMatchState | null;
  rightDisplay: DepthRowRightDisplay | null;
  watchlistEnabled: boolean;
  watchlistStarred: boolean;
}

interface DepthChartPositionCardProps {
  position: DepthChartPosition;
  slots: DepthChartSlotViewModel[];
  draftDisplaySlotKeys?: readonly string[];
  onPlayerClick: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
  onStarToggle: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
}

export function DepthChartPositionCard({
  position,
  slots,
  draftDisplaySlotKeys,
  onPlayerClick,
  onStarToggle,
}: DepthChartPositionCardProps) {
  const filled = slots.filter((s) => s.row).length;

  return (
    <section className="depth-position-card cc-surface-inset">
      <header className="depth-position-card__header">
        <h3 className="depth-position-card__title">
          <PosBadge pos={position} className="depth-position-card__pos-badge" />
          <span className="depth-position-card__position-name">
            {POSITION_LABELS[position] ?? position}
          </span>
        </h3>
        <span className="depth-position-card__fill">{filled}/3</span>
      </header>
      <ul className="depth-position-card__list">
        {slots.map((slot) => (
          <DepthChartPlayerRowItem
            key={`${position}-${slot.rank}`}
            position={position}
            slot={slot}
            draftDisplaySlotKeys={draftDisplaySlotKeys}
            onPlayerClick={onPlayerClick}
            onStarToggle={onStarToggle}
          />
        ))}
      </ul>
    </section>
  );
}

function positionBadgesForRow(
  row: DepthChartPlayerRow,
  catalogPlayer: Player | null,
  chartPosition: DepthChartPosition,
  draftDisplaySlotKeys?: readonly string[],
): string[] {
  let badges: string[] = [];
  if (catalogPlayer) {
    badges = playerDisplayPositionBadges(catalogPlayer, draftDisplaySlotKeys);
  }
  if (badges.length === 0) {
    const raw = row.primaryPosition?.trim();
    if (!raw) return [];
    const u = raw.toUpperCase();
    badges = u === "P" || u === "SP" || u === "RP" ? ["P"] : [raw];
  }

  const slot = chartPosition.toUpperCase();
  if (slot === "SP" || slot === "RP") {
    const pitch = badges.find((b) => b === "P");
    if (pitch) return [pitch];
  }
  const exact = badges.find((b) => b.toUpperCase() === slot);
  if (exact) return [exact];
  if (slot === "LF" || slot === "CF" || slot === "RF") {
    const of = badges.find((b) => b === "OF");
    if (of) return [of];
  }
  return badges.length > 0 ? [badges[0]!] : [];
}

function DepthChartPlayerRowItem({
  position,
  slot,
  draftDisplaySlotKeys,
  onPlayerClick,
  onStarToggle,
}: {
  position: DepthChartPosition;
  slot: DepthChartSlotViewModel;
  draftDisplaySlotKeys?: readonly string[];
  onPlayerClick: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
  onStarToggle: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
}) {
  const { rank, row, catalogPlayer, rightDisplay, watchlistEnabled, watchlistStarred } =
    slot;

  if (!row) {
    return (
      <li className="depth-player-row depth-player-row--empty">
        <span className="depth-player-row__rank">#{rank}</span>
        <span className="depth-player-row__empty-label">No assignment</span>
      </li>
    );
  }

  const injured = /injured|\bil\b/i.test(row.status);
  const positionBadges = positionBadgesForRow(
    row,
    catalogPlayer,
    position,
    draftDisplaySlotKeys,
  );
  const headshotSrc = catalogPlayer?.headshot ?? "";
  const isCustom = catalogPlayer?.id.startsWith("custom_") ?? false;
  const isRosteredWon = rightDisplay?.kind === "rostered_won";

  return (
    <li
      className={`depth-player-row depth-player-row--clickable ${isRosteredWon ? "depth-player-row--rostered-won" : ""} ${injured ? "depth-player-row--injured" : ""} ${row.outOfPosition || row.needsManualReview ? "depth-player-row--oof" : ""}`}
    >
      <span className="depth-player-row__rank">#{rank}</span>
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
      ) : (
        <span className="depth-player-row__star-spacer" aria-hidden />
      )}
      <button
        type="button"
        className="depth-player-row__main"
        onClick={() => onPlayerClick(row, position)}
      >
        <span className="depth-player-row__photo" aria-hidden>
          <PlayerHeadshot
            src={headshotSrc}
            name={row.playerName}
            isCustom={isCustom}
            size={34}
          />
        </span>
        <span className="depth-player-row__body">
          <span className="depth-player-row__title-line">
            <span className="depth-player-row__name" title={row.playerName}>
              {row.playerName}
            </span>
            {positionBadges.length > 0 ? (
              <span className="depth-player-row__pos-badges">
                {positionBadges.map((pos) => (
                  <PosBadge
                    key={`${row.playerId}-${pos}`}
                    pos={pos}
                    className="depth-player-row__pos-badge"
                  />
                ))}
              </span>
            ) : null}
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
          {(row.outOfPosition || row.needsManualReview) && (
            <span className="depth-player-row__flag">Manual review suggested</span>
          )}
        </span>
      </button>
      <div className="depth-player-row__aside">
        {rightDisplay ? <DepthRowRightLabel display={rightDisplay} /> : null}
      </div>
    </li>
  );
}

function DepthRowRightLabel({ display }: { display: DepthRowRightDisplay }) {
  if (display.kind === "auction") {
    return (
      <span className="depth-player-row__right depth-player-row__right--valuation">
        <span className="depth-player-row__value-label">Value</span>
        <span className="depth-player-row__auction-value">{display.formattedValue}</span>
      </span>
    );
  }

  if (display.kind === "rostered_won") {
    return (
      <span
        className="depth-player-row__right depth-player-row__right--rostered-won"
        title={`Drafted by ${display.teamName} for ${display.formattedPrice} (not our valuation)`}
      >
        <span
          className="depth-player-row__value-label depth-player-row__value-label--team"
          title={display.teamName}
        >
          {display.teamName}
        </span>
        <span className="depth-player-row__paid-price">{display.formattedPrice}</span>
      </span>
    );
  }

  if (display.kind === "dash") {
    return (
      <span
        className="depth-player-row__right depth-player-row__right--dash"
        aria-label="Not in valuation pool"
        title="Catalog only — not in valuation pool"
      />
    );
  }

  return (
    <span className="depth-player-row__right">
      <span
        className={`depth-player-row__badge depth-player-row__badge--${display.state}`}
        title={display.title}
      >
        {display.label}
      </span>
    </span>
  );
}
