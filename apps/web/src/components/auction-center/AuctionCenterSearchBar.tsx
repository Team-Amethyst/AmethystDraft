import type { RefObject } from "react";
import { UserPlus } from "lucide-react";
import type { Player } from "../../types/player";
import PosBadge from "../PosBadge";
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
          <div className="cc-search-dropdown">
            {dropdownResults.length > 0 ? (
              dropdownResults.map((p) => {
                const auction = typeaheadAuctionDollars(p);
                const playPos = playerDisplayPositionBadges(p, draftDisplaySlotKeys);
                const draftSlots = playerDraftableRosterSlots(p, draftDisplaySlotKeys);
                return (
                  <button
                    key={p.id}
                    className="cc-dropdown-item"
                    type="button"
                    onMouseDown={() => onSelectPlayer(p)}
                  >
                    <div className="cc-dd-main">
                      <div className="cc-dd-name-row">
                        <span className="cc-dd-name-text">
                          {p.name}
                          {p.injuryStatus && (
                            <span className="pt-il-badge">
                              {p.injuryStatus.replace("DL", "IL")}
                            </span>
                          )}
                          {isInWatchlist(p.id) && (
                            <span className="cc-dd-wl" title="On your watchlist">
                              ★
                            </span>
                          )}
                        </span>
                        {playPos.length > 0 ? (
                          <span className="cc-dd-play-pos" title="Positions played">
                            {playPos.map((pos) => (
                              <PosBadge key={`${p.id}-play-${pos}`} pos={pos} />
                            ))}
                          </span>
                        ) : null}
                      </div>
                      {draftSlots.length > 0 ? (
                        <span
                          className="cc-dd-slot-row"
                          title="Roster slots you can draft this player into"
                        >
                          {draftSlots.map((slot) => (
                            <PosBadge
                              key={`${p.id}-draft-${slot}`}
                              pos={slot}
                              className="cc-dd-slot-badge"
                            />
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <span className="cc-dd-team">{p.team}</span>
                    <span className="cc-dd-val" title="League auction value (Engine)">
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
