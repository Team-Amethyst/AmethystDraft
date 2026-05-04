import type { RefObject } from "react";
import type { StatBasis } from "@repo/player-stat-basis";
import {
  statBasisAllValues,
  statBasisPillLabel,
} from "@repo/player-stat-basis";
import { Search, Star, RotateCcw, Tag } from "lucide-react";
import { PLAYER_TABLE_FILTER_TAGS } from "../domain/playerTableTags";
import {
  positionFilterAfterStatViewChange,
  positionFilterOptionsForStatView,
} from "../domain/playerTablePositions";

export type PlayerTableControlsProps = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  availabilityFilter: "all" | "available" | "drafted";
  onAvailabilityFilterChange: (v: "all" | "available" | "drafted") => void;
  statView: "all" | "hitting" | "pitching";
  onStatViewChange: (v: "all" | "hitting" | "pitching") => void;
  positionFilter: string;
  onPositionChange: (p: string) => void;
  injuryFilter: "all" | "healthy" | "injured";
  onInjuryFilterChange: (v: "all" | "healthy" | "injured") => void;
  starredOnly: boolean;
  onStarredOnlyToggle: () => void;
  selectedTags: ReadonlySet<string>;
  tagDropdownOpen: boolean;
  onTagDropdownToggle: () => void;
  tagDropdownRef: RefObject<HTMLDivElement | null>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onResetFilters: () => void;
  statBasis?: StatBasis;
  onStatBasisChange?: (b: StatBasis) => void;
};

export function PlayerTableControls({
  searchQuery,
  onSearchChange,
  searchInputRef,
  availabilityFilter,
  onAvailabilityFilterChange,
  statView,
  onStatViewChange,
  positionFilter,
  onPositionChange,
  injuryFilter,
  onInjuryFilterChange,
  starredOnly,
  onStarredOnlyToggle,
  selectedTags,
  tagDropdownOpen,
  onTagDropdownToggle,
  tagDropdownRef,
  onToggleTag,
  onClearTags,
  onResetFilters,
  statBasis,
  onStatBasisChange,
}: PlayerTableControlsProps) {
  return (
    <div className="pt-controls">
      <div className="pt-search">
        <Search size={15} className="pt-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search players by name..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pt-search-input"
        />
      </div>

      <div className="pt-filters">
        <select
          className="pt-select"
          value={availabilityFilter}
          onChange={(e) =>
            onAvailabilityFilterChange(
              e.target.value as "all" | "available" | "drafted",
            )
          }
        >
          <option value="all">Availability (All)</option>
          <option value="available">Available</option>
          <option value="drafted">Drafted</option>
        </select>

        <select
          className="pt-select"
          value={statView}
          onChange={(e) => {
            const v = e.target.value as "all" | "hitting" | "pitching";
            onStatViewChange(v);
            const nextPos = positionFilterAfterStatViewChange(v, positionFilter);
            if (nextPos !== null) onPositionChange(nextPos);
          }}
        >
          <option value="all">Hitters/Pitchers</option>
          <option value="hitting">Hitters</option>
          <option value="pitching">Pitchers</option>
        </select>

        <select
          className="pt-select"
          value={positionFilter}
          onChange={(e) => onPositionChange(e.target.value)}
        >
          <option value="all">Position (All)</option>
          {positionFilterOptionsForStatView(statView).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="pt-select"
          value={injuryFilter}
          onChange={(e) =>
            onInjuryFilterChange(e.target.value as "all" | "healthy" | "injured")
          }
        >
          <option value="all">Health (All)</option>
          <option value="healthy">Healthy only</option>
          <option value="injured">Injured only</option>
        </select>

        <button
          type="button"
          className={"pt-toggle " + (starredOnly ? "active" : "")}
          onClick={onStarredOnlyToggle}
        >
          <Star size={13} fill={starredOnly ? "#fbbf24" : "none"} />
          Starred only
        </button>
        <div className="pt-tag-wrap">
          <button
            type="button"
            className={"pt-toggle " + (selectedTags.size > 0 ? "active" : "")}
            onClick={onTagDropdownToggle}
          >
            <Tag size={13} />
            Tags{selectedTags.size > 0 ? ` (${selectedTags.size})` : ""}
          </button>
          {tagDropdownOpen && (
            <div className="pt-tag-dropdown" ref={tagDropdownRef}>
              {PLAYER_TABLE_FILTER_TAGS.map((tag) => (
                <label key={tag} className="pt-tag-option">
                  <input
                    type="checkbox"
                    checked={selectedTags.has(tag)}
                    onChange={() => onToggleTag(tag)}
                  />
                  <span className="tag">{tag}</span>
                </label>
              ))}
              {selectedTags.size > 0 && (
                <button type="button" className="pt-tag-clear" onClick={onClearTags}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="pt-icon-btn"
          title="Reset filters"
          onClick={onResetFilters}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      {onStatBasisChange && (
        <div className="pt-basis-pills">
          {statBasisAllValues().map((b) => (
            <button
              key={b}
              type="button"
              className={
                "pt-pill " + ((statBasis ?? "projections") === b ? "active" : "")
              }
              onClick={() => onStatBasisChange(b)}
            >
              {statBasisPillLabel(b)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
