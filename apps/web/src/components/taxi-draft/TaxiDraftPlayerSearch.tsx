import { useEffect, useRef } from "react";
import { useWatchlist } from "../../contexts/WatchlistContext";
import type { Player } from "../../types/player";
import PosBadge from "../PosBadge";

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
              results.map((p) => (
                <button
                  key={p.id}
                  className="cc-dropdown-item"
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPickPlayer(p);
                  }}
                >
                  <PosBadge pos={p.position} />
                  <span className="cc-dd-name">
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
                  <span className="cc-dd-team">{p.team}</span>
                  <span className="cc-dd-val">${p.value}</span>
                </button>
              ))
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
