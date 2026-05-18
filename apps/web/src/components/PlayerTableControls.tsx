import { useMemo, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
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
import { useAnchoredOverlayPosition } from "../hooks/useAnchoredOverlayPosition";
import { AppSelect, type AppSelectOption } from "./AppSelect";

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
  tagDropdownMenuRef: RefObject<HTMLDivElement | null>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onResetFilters: () => void;
  statBasis?: StatBasis;
  onStatBasisChange?: (b: StatBasis) => void;
  /** Research layout: optional model rank + tier columns. */
  researchModelColumns?: boolean;
  onResearchModelColumnsToggle?: () => void;
};

const AVAILABILITY_OPTIONS: AppSelectOption[] = [
  { value: "all", label: "Availability (All)" },
  { value: "available", label: "Available" },
  { value: "drafted", label: "Drafted" },
];

const STAT_VIEW_OPTIONS: AppSelectOption[] = [
  { value: "all", label: "Hitters/Pitchers" },
  { value: "hitting", label: "Hitters" },
  { value: "pitching", label: "Pitchers" },
];

const INJURY_OPTIONS: AppSelectOption[] = [
  { value: "all", label: "Health (All)" },
  { value: "healthy", label: "Healthy only" },
  { value: "injured", label: "Injured only" },
];

/** Matches Research toolbar filter-track styling in `PlayerTable.css`. */
const PT_FILTER_FIELD = "pt-filter-field";

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
  tagDropdownMenuRef,
  onToggleTag,
  onClearTags,
  onResetFilters,
  statBasis,
  onStatBasisChange,
  researchModelColumns,
  onResearchModelColumnsToggle,
}: PlayerTableControlsProps) {
  const tagTriggerRef = useRef<HTMLButtonElement>(null);
  const tagMenuStyle = useAnchoredOverlayPosition(tagDropdownOpen, tagTriggerRef, {
    maxWidth: 288,
  });

  const positionOptions = useMemo<AppSelectOption[]>(() => {
    const rows = positionFilterOptionsForStatView(statView).map((p) => ({
      value: p,
      label: p,
    }));
    return [{ value: "all", label: "Position (All)" }, ...rows];
  }, [statView]);

  return (
    <div className="pt-controls">
      <div className="pt-controls-main">
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

      <div className="pt-toolbar">
        <div className="pt-toolbar__start">
        <div className="pt-filter-group">
        <AppSelect
          className={PT_FILTER_FIELD}
          compact
          value={availabilityFilter}
          onChange={(v) =>
            onAvailabilityFilterChange(v as "all" | "available" | "drafted")
          }
          options={AVAILABILITY_OPTIONS}
          aria-label="Availability filter"
        />

        <AppSelect
          className={PT_FILTER_FIELD}
          compact
          value={statView}
          onChange={(v) => {
            const next = v as "all" | "hitting" | "pitching";
            onStatViewChange(next);
            const nextPos = positionFilterAfterStatViewChange(
              next,
              positionFilter,
            );
            if (nextPos !== null) onPositionChange(nextPos);
          }}
          options={STAT_VIEW_OPTIONS}
          aria-label="Hitters or pitchers"
        />

        <AppSelect
          className={PT_FILTER_FIELD}
          compact
          value={positionFilter}
          onChange={onPositionChange}
          options={positionOptions}
          aria-label="Position filter"
        />

        <AppSelect
          className={PT_FILTER_FIELD}
          compact
          value={injuryFilter}
          onChange={(v) =>
            onInjuryFilterChange(v as "all" | "healthy" | "injured")
          }
          options={INJURY_OPTIONS}
          aria-label="Health filter"
        />
        </div>

        <div className="pt-toggle-group">
        <button
          type="button"
          className={
            "pt-toggle pt-toggle--star" + (starredOnly ? " active" : "")
          }
          onClick={onStarredOnlyToggle}
        >
          <Star size={13} fill={starredOnly ? "#fbbf24" : "none"} aria-hidden />
          Starred
        </button>
        {onResearchModelColumnsToggle && (
          <button
            type="button"
            className={
              "pt-toggle pt-toggle--model" + (researchModelColumns ? " active" : "")
            }
            title="Show catalog model rank and model tier columns (preseason buckets)."
            onClick={onResearchModelColumnsToggle}
          >
            <span className="pt-toggle__label pt-toggle__label--long">Model rank</span>
            <span className="pt-toggle__label pt-toggle__label--short" aria-hidden>
              Model
            </span>
          </button>
        )}
        <div className="pt-tag-wrap" ref={tagDropdownRef}>
          <button
            ref={tagTriggerRef}
            type="button"
            className={"pt-toggle" + (selectedTags.size > 0 ? " active" : "")}
            onClick={onTagDropdownToggle}
          >
            <Tag size={13} />
            Tags{selectedTags.size > 0 ? ` · ${selectedTags.size}` : ""}
          </button>
          {tagDropdownOpen
            ? createPortal(
                <div
                  ref={tagDropdownMenuRef}
                  className="pt-control-theme pt-tag-dropdown pt-tag-dropdown--portal"
                  style={tagMenuStyle}
                >
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
                </div>,
                document.body,
              )
            : null}
        </div>
        </div>

        <button
          type="button"
          className="pt-icon-btn pt-reset-btn"
          title="Reset filters"
          aria-label="Reset filters"
          onClick={onResetFilters}
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        </div>

        {onStatBasisChange && (
          <div className="pt-basis-pills">
            <span className="pt-basis-pills-label" aria-hidden>
              Stats
            </span>
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
      </div>
    </div>
  );
}
