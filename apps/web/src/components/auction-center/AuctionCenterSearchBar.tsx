import type { RefObject } from "react";
import { UserPlus } from "lucide-react";
import type { Player } from "../../types/player";
import PosBadge from "../PosBadge";
import { PlayerHeadshot } from "../PlayerTableParts";
import {
  playerDisplayPositionBadges,
  playerDraftableRosterSlots,
} from "../../utils/eligibility";

export interface AuctionCenterSearchBarProps {
  searchRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  selectedPlayer: Player | null;
  onClearSelection: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showDropdown: boolean;
  dropdownResults: Player[];
  /** League-wide Engine auction $ (matches card "Auction value"), not catalog `Player.value`. */
  typeaheadAuctionDollars: (player: Player) => number | null;
  /** League roster slot keys (order preserved for badge order). */
  draftDisplaySlotKeys: string[];
  onSelectPlayer: (player: Player) => void;
  isInWatchlist: (playerId: string) => boolean;
  onAddMissingPlayer?: () => void;
  onDismissDropdown: () => void;
}

function normalizePosToken(pos: string): string {
  return pos.toUpperCase().replace(/\s+/g, "");
}

/** Roster slot labels for the palette row (excludes primary position tokens). */
function paletteSlotLine(primaryTags: string[], draftSlots: string[]): string {
  if (draftSlots.length === 0) return "";
  const primary = new Set(primaryTags.map(normalizePosToken));
  const parts = draftSlots.filter((s) => !primary.has(normalizePosToken(s)));
  return parts.join(" · ");
}

export function AuctionCenterSearchBar({
  searchRef,
  searchInputRef,
  searchQuery,
  onSearchChange,
  onSearchFocus,
  selectedPlayer,
  onClearSelection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showDropdown,
  dropdownResults,
  typeaheadAuctionDollars,
  draftDisplaySlotKeys,
  onSelectPlayer,
  isInWatchlist,
  onAddMissingPlayer,
  onDismissDropdown,
}: AuctionCenterSearchBarProps) {
  return (
    <div className="cc-search-wrap" ref={searchRef}>
      <div className="cc-search-inner">
        <div className="auction-search-bar">
          <span className="auction-search-icon">⊕</span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder={
              selectedPlayer
                ? `${selectedPlayer.name} — type to switch...`
                : "Search player to load into auction..."
            }
            className="auction-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
          />
          {selectedPlayer && (
            <button className="cc-clear-btn" onClick={onClearSelection} type="button">
              ✕
            </button>
          )}
          <div className="cc-undo-redo">
            <button
              className="cc-ur-btn"
              title="Undo last pick"
              type="button"
              disabled={!canUndo}
              onClick={() => void onUndo()}
            >
              ↩
            </button>
            <button
              className="cc-ur-btn"
              title="Redo last pick"
              type="button"
              disabled={!canRedo}
              onClick={() => void onRedo()}
            >
              ↪
            </button>
          </div>
        </div>
        {showDropdown && (
          <div className="cc-search-dropdown cc-search-dropdown--palette">
            {dropdownResults.length > 0 ? (
              dropdownResults.map((p) => {
                const auction = typeaheadAuctionDollars(p);
                const playPos = playerDisplayPositionBadges(p, draftDisplaySlotKeys);
                const draftSlots = playerDraftableRosterSlots(p, draftDisplaySlotKeys);
                const primaryPos = playPos[0] ?? p.position ?? "";
                const slotsLine = paletteSlotLine(playPos, draftSlots);
                const injuryLabel = p.injuryStatus
                  ? p.injuryStatus.replace("DL", "IL")
                  : null;

                return (
                  <button
                    key={p.id}
                    className="cc-palette-item"
                    type="button"
                    onMouseDown={() => onSelectPlayer(p)}
                  >
                    <span className="cc-palette-photo" aria-hidden>
                      <PlayerHeadshot
                        src={p.headshot}
                        name={p.name}
                        isCustom={p.id.startsWith("custom_")}
                        size={40}
                      />
                    </span>
                    <span
                      className="cc-palette-gap cc-palette-gap--photo-name"
                      aria-hidden
                    />
                    <span className="cc-palette-identity">
                      <span className="cc-palette-name">{p.name}</span>
                      {injuryLabel ? (
                        <span
                          className="cc-palette-injury"
                          title={`Injury: ${injuryLabel}`}
                        >
                          {injuryLabel}
                        </span>
                      ) : null}
                      {isInWatchlist(p.id) ? (
                        <span className="cc-palette-wl" title="On your watchlist">
                          ★
                        </span>
                      ) : null}
                    </span>
                    {p.team ? (
                      <span className="cc-palette-team">{p.team}</span>
                    ) : (
                      <span className="cc-palette-team cc-palette-team--empty" />
                    )}
                    <span
                      className="cc-palette-gap cc-palette-gap--team-pos"
                      aria-hidden
                    />
                    {primaryPos ? (
                      <span className="cc-palette-pos" title="Primary position">
                        <PosBadge pos={primaryPos} />
                      </span>
                    ) : (
                      <span className="cc-palette-pos cc-palette-pos--empty" />
                    )}
                    {slotsLine ? (
                      <span
                        className="cc-palette-slots"
                        title="Roster slots you can draft this player into"
                      >
                        {slotsLine}
                      </span>
                    ) : (
                      <span className="cc-palette-slots cc-palette-slots--empty" />
                    )}
                    <span className="cc-palette-val" title="League auction value (Engine)">
                      {auction != null ? `$${Math.round(auction)}` : "—"}
                    </span>
                  </button>
                );
              })
            ) : searchQuery.length >= 2 ? (
              <div className="asd-no-results">
                <span className="asd-no-results-text">
                  No players found for "{searchQuery}"
                </span>
                <button
                  className="asd-add-missing-btn"
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onDismissDropdown();
                    onAddMissingPlayer?.();
                  }}
                >
                  <UserPlus size={13} />
                  Add "{searchQuery}" as custom player
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
