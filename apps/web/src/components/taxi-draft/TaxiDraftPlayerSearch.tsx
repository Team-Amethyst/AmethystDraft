import { useEffect, useRef } from "react";
import { useWatchlist } from "../../contexts/WatchlistContext";
import type { Player } from "../../types/player";
import PosBadge from "../PosBadge";
import { PlayerHeadshot } from "../PlayerTableParts";
import {
  playerDisplayPositionBadges,
  playerDisplaySlotEligibilityBadges,
} from "../../utils/eligibility";

export interface TaxiDraftPlayerSearchProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  showDropdown: boolean;
  onDismissDropdown: () => void;
  results: readonly Player[];
  onPickPlayer: (player: Player) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When set, badges show league-draftable slots (excludes UTIL/BN/DH). */
  draftDisplaySlotKeys?: string[];
}

/**
 * Command Center player typeahead (same chrome as AuctionCenterSearchBar, without undo/redo).
 */
export function TaxiDraftPlayerSearch({
  searchQuery,
  onSearchChange,
  onSearchFocus,
  showDropdown,
  onDismissDropdown,
  results,
  onPickPlayer,
  placeholder = "Search player to add to taxi…",
  disabled = false,
  draftDisplaySlotKeys,
}: TaxiDraftPlayerSearchProps) {
  const { isInWatchlist } = useWatchlist();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (searchRef.current?.contains(e.target as Node)) return;
      onDismissDropdown();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onDismissDropdown]);

  return (
    <div className="cc-search-wrap taxi-draft-cc-search" ref={searchRef}>
      <div className="cc-search-inner">
        <div className="auction-search-bar">
          <span className="auction-search-icon">⊕</span>
          <input
            type="text"
            placeholder={placeholder}
            className="auction-search-input"
            value={searchQuery}
            disabled={disabled}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
          />
        </div>
        {showDropdown && (
          <div className="cc-search-dropdown">
            {results.length > 0 ? (
              results.map((p) => {
                const posBadges = playerDisplayPositionBadges(
                  p,
                  draftDisplaySlotKeys,
                );
                const slotBadges = playerDisplaySlotEligibilityBadges(
                  p,
                  draftDisplaySlotKeys,
                );
                return (
                  <button
                    key={p.id}
                    className="cc-dropdown-item"
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onPickPlayer(p);
                    }}
                  >
                    <span className="cc-dd-photo" aria-hidden>
                      <PlayerHeadshot
                        src={p.headshot}
                        name={p.name}
                        isCustom={p.id.startsWith("custom_")}
                      />
                    </span>
                    <span className="cc-dd-content">
                    <span className="cc-dd-name">{p.name}</span>
                    {p.team ? <span className="cc-dd-team">{p.team}</span> : null}
                    {posBadges.length > 0 ? (
                      <span className="cc-dd-play-pos" title="Positions played">
                        {posBadges.map((pos) => (
                          <PosBadge key={`${p.id}-${pos}`} pos={pos} />
                        ))}
                      </span>
                    ) : null}
                    {p.injuryStatus ? (
                      <span className="pt-il-badge cc-dd-injury">
                        {p.injuryStatus.replace("DL", "IL")}
                      </span>
                    ) : null}
                    {isInWatchlist(p.id) ? (
                      <span className="cc-dd-wl" title="On your watchlist">
                        ★
                      </span>
                    ) : null}
                    <span className="cc-dd-trail">
                      {slotBadges.length > 0 ? (
                        <span
                          className="cc-dd-slot-row"
                          title="Roster slots this player can fill"
                        >
                          {slotBadges.map((s) => (
                            <PosBadge
                              key={`${p.id}-slot-${s}`}
                              pos={s}
                              className="cc-dd-slot-badge"
                            />
                          ))}
                        </span>
                      ) : null}
                      <span className="cc-dd-val">${p.value}</span>
                    </span>
                    </span>
                  </button>
                );
              })
            ) : searchQuery.length >= 2 ? (
              <div className="taxi-draft-search-empty">
                <span>No eligible taxi players match &ldquo;{searchQuery}&rdquo;</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
