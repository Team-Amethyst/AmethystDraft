import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { StatBasis } from "@repo/player-stat-basis";
import {
  getCategoryTags,
  getDisplayStatValue,
  playerIsPitcher,
  resolveDisplayStats,
  statBasisFooterDescription,
} from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import { useWatchlist } from "../contexts/WatchlistContext";
import PosBadge from "./PosBadge";
import "./PlayerTable.css";
import {
  catalogPlayerIdInStringSet,
  hasRosterMapEntryForCatalogPlayer,
  lookupRosterMapForCatalogPlayer,
} from "../domain/catalogPlayerKeys";
import {
  battingStatColumnLabels,
  pitchingStatColumnLabels,
} from "../domain/playerTableColumns";
import { sortPlayerTableRows } from "../domain/playerTableSort";
import { playerTableRowsMatchingTagFilter } from "../domain/playerTableTagFilter";
import { PlayerTableControls } from "./PlayerTableControls";
import {
  formatCurrencyWhole,
  formatMaybeDelta,
  playerValuationEdgeOrDiff,
  valuationSortLabel,
  type ValuationSortField,
} from "../utils/valuation";
import CustomPlayerHeadshot from "./CustomPlayerHeadshot";

interface PlayerTableProps {
  players: Player[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  positionFilter: string;
  onPositionChange: (position: string) => void;
  statBasis?: StatBasis;
  onStatBasisChange?: (basis: StatBasis) => void;
  onPlayerClick?: (player: Player) => void;
  scoringCategories?: { name: string; type: "batting" | "pitching" }[];
  getNote?: (playerId: string) => string;
  onNoteChange?: (playerId: string, note: string) => void;
  draftedIds?: Set<string>;
  draftedByTeam?: Map<string, string>;
  draftedContractByPlayerId?: Map<string, string>;
  isCustomPlayer?: (id: string) => boolean;
  /** League-scoped Engine catalog batch (e.g. Research); optional second line under Proj $. */
  engineCatalogByPlayerId?: ReadonlyMap<
    string,
    { value: number; tier: number }
  >;
  defaultValuationSortField?: ValuationSortField;
}

const TIER_COLORS: Record<number, string> = {
  1: "#a855f7",
  2: "#6366f1",
  3: "#22c55e",
  4: "#f59e0b",
  5: "#6b7280",
};

function TierBadge({ tier }: { tier: number }) {
  return (
    <span
      className="tier-badge"
      style={{ background: TIER_COLORS[tier] ?? "#6b7280" }}
    >
      {tier}
    </span>
  );
}

function PlayerHeadshot({
  src,
  name,
  isCustom,
}: {
  src: string;
  name: string;
  isCustom?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (isCustom) {
    return <CustomPlayerHeadshot size={32} />;
  }
  if (failed || !src) {
    return <div className="headshot-fallback">{initials}</div>;
  }
  return (
    <img
      src={src}
      alt={name}
      className="player-headshot"
      onError={() => setFailed(true)}
    />
  );
}

function NoteCell({
  playerId,
  getNote,
  onNoteChange,
}: {
  playerId: string;
  playerName: string;
  tags: string[];
  getNote: (id: string) => string;
  onNoteChange: (id: string, note: string) => void;
}) {
  const [value, setValue] = useState(() => getNote(playerId));

  // Sync if the note changes externally (e.g. loaded from DB after mount)
  const contextNote = getNote(playerId);
  useEffect(() => {
    setValue(contextNote);
  }, [contextNote]);

  return (
    <input
      className="pt-note-input"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onNoteChange(playerId, e.target.value);
      }}
      placeholder="Add note..."
      title={value}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function asFinite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function SortArrow({
  col,
  sort,
}: {
  col: string;
  sort: { col: string; dir: "asc" | "desc" } | null;
}) {
  if (sort?.col !== col)
    return <span className="th-sort-icon th-sort-idle">↕</span>;
  return (
    <span className="th-sort-icon th-sort-active">
      {sort.dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

export default function PlayerTable({
  players,
  searchQuery,
  onSearchChange,
  positionFilter,
  onPositionChange,
  statBasis = "projections",
  onStatBasisChange,
  onPlayerClick,
  scoringCategories,
  getNote,
  onNoteChange,
  draftedIds,
  draftedByTeam,
  draftedContractByPlayerId,
  isCustomPlayer,
  engineCatalogByPlayerId,
  defaultValuationSortField = "recommended_bid",
}: PlayerTableProps) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [starredOnly, setStarredOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem("amethyst-pt-starred") === "true";
    } catch {
      return false;
    }
  });
  const [injuryFilter, setInjuryFilter] = useState<
    "all" | "healthy" | "injured"
  >(() => {
    try {
      return (
        (localStorage.getItem("amethyst-pt-injury") as
          | "all"
          | "healthy"
          | "injured") ?? "all"
      );
    } catch {
      return "all";
    }
  });
  const [availabilityFilter, setAvailabilityFilter] = useState<
    "all" | "available" | "drafted"
  >(() => {
    try {
      return (
        (localStorage.getItem("amethyst-pt-availability") as
          | "all"
          | "available"
          | "drafted") ?? "all"
      );
    } catch {
      return "all";
    }
  });
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem("amethyst-pt-tags");
      return s ? new Set(JSON.parse(s) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [statView, setStatView] = useState<"all" | "hitting" | "pitching">(
    () => {
      try {
        return (
          (localStorage.getItem("amethyst-pt-statview") as
            | "all"
            | "hitting"
            | "pitching") ?? "all"
        );
      } catch {
        return "all";
      }
    },
  );
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [clientSort, setClientSort] = useState<{
    col: string;
    dir: "asc" | "desc";
  }>(() => {
    try {
      const s = localStorage.getItem("amethyst-pt-sort");
      return s
        ? (JSON.parse(s) as { col: string; dir: "asc" | "desc" })
        : { col: "adp", dir: "asc" };
    } catch {
      return { col: "adp", dir: "asc" };
    }
  });
  const valuationSortField: ValuationSortField = defaultValuationSortField;

  useEffect(() => {
    try {
      localStorage.setItem("amethyst-pt-starred", String(starredOnly));
    } catch {
      /* noop */
    }
  }, [starredOnly]);
  useEffect(() => {
    try {
      localStorage.setItem("amethyst-pt-injury", injuryFilter);
    } catch {
      /* noop */
    }
  }, [injuryFilter]);
  useEffect(() => {
    try {
      localStorage.setItem("amethyst-pt-availability", availabilityFilter);
    } catch {
      /* noop */
    }
  }, [availabilityFilter]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "amethyst-pt-tags",
        JSON.stringify([...selectedTags]),
      );
    } catch {
      /* noop */
    }
  }, [selectedTags]);
  useEffect(() => {
    try {
      localStorage.setItem("amethyst-pt-sort", JSON.stringify(clientSort));
    } catch {
      /* noop */
    }
  }, [clientSort]);
  useEffect(() => {
    try {
      localStorage.setItem("amethyst-pt-statview", statView);
    } catch {
      /* noop */
    }
  }, [statView]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node)
      ) {
        setTagDropdownOpen(false);
      }
    }
    if (tagDropdownOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [tagDropdownOpen]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function handleColSort(col: string) {
    setClientSort((prev) => {
      if (prev?.col === col)
        return { col, dir: prev.dir === "asc" ? "desc" : "asc" };
      const defaultAsc = col === "adp" || col === "tier";
      return { col, dir: defaultAsc ? "asc" : "desc" };
    });
  }

  const batCols = useMemo(
    () => battingStatColumnLabels(scoringCategories),
    [scoringCategories],
  );

  const pitCols = useMemo(
    () => pitchingStatColumnLabels(scoringCategories),
    [scoringCategories],
  );

  const numStatCols = Math.max(batCols.length, pitCols.length);
  // When a focused view is selected, use only that side's columns
  const focusedCols =
    statView === "hitting" ? batCols : statView === "pitching" ? pitCols : null;
  const focusedType: "batting" | "pitching" | null =
    statView === "hitting"
      ? "batting"
      : statView === "pitching"
        ? "pitching"
        : null;
  const numActiveCols = focusedCols ? focusedCols.length : numStatCols;

  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Two-phase render: paint the first INITIAL_ROWS synchronously so the page
  // appears instantly, then expand to the full list as a low-priority transition.
  const INITIAL_ROWS = 60;
  const [fullyRendered, setFullyRendered] = useState(false);
  useEffect(() => {
    startTransition(() => setFullyRendered(true));
  }, []);

  const toggleWatchlist = (player: Player) => {
    if (isInWatchlist(player.id)) removeFromWatchlist(player.id);
    else addToWatchlist(player);
  };

  const statBasisFooterLine = statBasisFooterDescription(statBasis);

  // Determine pitcher by stats presence (same heuristic as isBatter below),
  // falling back to position string so list works even with sparse data.
  const displayed = useMemo(() => {
    let base = starredOnly
      ? players.filter((p) => isInWatchlist(p.id))
      : players;
    if (availabilityFilter === "available")
      base = base.filter(
        (p) => !draftedIds || !catalogPlayerIdInStringSet(draftedIds, p),
      );
    else if (availabilityFilter === "drafted")
      base = base.filter(
        (p) => !!draftedIds && catalogPlayerIdInStringSet(draftedIds, p),
      );
    if (injuryFilter === "healthy") base = base.filter((p) => !p.injuryStatus);
    else if (injuryFilter === "injured")
      base = base.filter((p) => !!p.injuryStatus);
    if (statView === "hitting") base = base.filter((p) => !playerIsPitcher(p));
    else if (statView === "pitching")
      base = base.filter((p) => playerIsPitcher(p));
    return base;
  }, [
    players,
    starredOnly,
    injuryFilter,
    availabilityFilter,
    draftedIds,
    statView,
    isInWatchlist,
  ]);

  // Pre-compute tags for all players so we can filter before slicing
  const allRowData = useMemo(
    () =>
      displayed.map((player) => {
        const { bat, pit } = resolveDisplayStats(player, statBasis);
        return {
          player,
          bat,
          pit,
          isBatter: !!bat || !pit,
          tags: getCategoryTags(bat, pit),
          valDiff: playerValuationEdgeOrDiff(player),
        };
      }),
    [displayed, statBasis],
  );

  const filteredRowData = useMemo(
    () => playerTableRowsMatchingTagFilter(allRowData, selectedTags),
    [allRowData, selectedTags],
  );

  const sortedRowData = useMemo(
    () =>
      sortPlayerTableRows(
        filteredRowData,
        clientSort,
        batCols,
        pitCols,
        valuationSortField,
        statBasis,
      ),
    [
      filteredRowData,
      clientSort,
      batCols,
      pitCols,
      valuationSortField,
      statBasis,
    ],
  );

  const rowData = useMemo(
    () =>
      fullyRendered ? sortedRowData : sortedRowData.slice(0, INITIAL_ROWS),
    [sortedRowData, fullyRendered],
  );

  return (
    <div className="pt-container">
      <PlayerTableControls
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchInputRef={searchInputRef}
        availabilityFilter={availabilityFilter}
        onAvailabilityFilterChange={setAvailabilityFilter}
        statView={statView}
        onStatViewChange={setStatView}
        positionFilter={positionFilter}
        onPositionChange={onPositionChange}
        injuryFilter={injuryFilter}
        onInjuryFilterChange={setInjuryFilter}
        starredOnly={starredOnly}
        onStarredOnlyToggle={() => setStarredOnly((v) => !v)}
        selectedTags={selectedTags}
        tagDropdownOpen={tagDropdownOpen}
        onTagDropdownToggle={() => setTagDropdownOpen((v) => !v)}
        tagDropdownRef={tagDropdownRef}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTags(new Set())}
        onResetFilters={() => {
          onSearchChange("");
          onPositionChange("all");
          setSelectedTags(new Set());
          setAvailabilityFilter("all");
          setInjuryFilter("all");
          setStatView("all");
        }}
        statBasis={statBasis}
        onStatBasisChange={onStatBasisChange}
      />

      {/* ── Table ── */}
      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th className="th-rank">Rank</th>
              <th className="th-star"></th>
              <th className="th-player">Player</th>
              <th className="th-pos">Pos</th>
              <th className="th-team">Team</th>
              <th
                className="th-tier th-sortable"
                onClick={() => handleColSort("tier")}
              >
                Tier <SortArrow col="tier" sort={clientSort} />
              </th>
              <th
                className="th-adp th-sortable"
                onClick={() => handleColSort("adp")}
              >
                ADP <SortArrow col="adp" sort={clientSort} />
              </th>
              <th
                className="th-value th-sortable"
                onClick={() => handleColSort("value")}
                title="General auction guidance based on player strength and market conditions."
              >
                Likely Bid <SortArrow col="value" sort={clientSort} />
              </th>
              <th
                className="th-valdiff th-sortable"
                onClick={() => handleColSort("valdiff")}
              >
                Val Diff <SortArrow col="valdiff" sort={clientSort} />
              </th>
              {focusedCols
                ? focusedCols.map((col, i) => (
                    <th
                      key={i}
                      className={`${i === 0 ? "th-avg" : "th-stat"} th-sortable`}
                      onClick={() => handleColSort(`stat-${i}`)}
                    >
                      {col} <SortArrow col={`stat-${i}`} sort={clientSort} />
                    </th>
                  ))
                : Array.from({ length: numStatCols }, (_, i) => {
                    const b = batCols[i];
                    const p = pitCols[i];
                    const label = b && p ? `${b}/${p}` : (b ?? p ?? "");
                    return (
                      <th
                        key={i}
                        className={`${i === 0 ? "th-avg" : "th-stat"} th-sortable`}
                        onClick={() => handleColSort(`stat-${i}`)}
                      >
                        {label}{" "}
                        <SortArrow col={`stat-${i}`} sort={clientSort} />
                      </th>
                    );
                  })}
              <th className="th-notes">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredRowData.length === 0 && (
              <tr>
                <td colSpan={10 + numActiveCols} className="pt-empty">
                  No players found.
                </td>
              </tr>
            )}
            {rowData.map(
              ({ player, bat, pit, isBatter, tags, valDiff }, index) => {
                const isStarred = isInWatchlist(player.id);
                const eng = engineCatalogByPlayerId?.get(player.id);
                const primaryValue = asFinite(player.recommended_bid);
                const secondaryValue = asFinite(player.team_adjusted_value);
                const draftedTeamName = draftedByTeam
                  ? lookupRosterMapForCatalogPlayer(draftedByTeam, player)
                  : undefined;
                const draftedContractLabel = draftedContractByPlayerId
                  ? lookupRosterMapForCatalogPlayer(draftedContractByPlayerId, player)
                  : undefined;

                return (
                  <tr
                    key={player.id}
                    className={
                      "pt-row" +
                      (isStarred ? " pt-row--starred" : "") +
                      (draftedIds && catalogPlayerIdInStringSet(draftedIds, player)
                        ? " pt-row--drafted"
                        : "") +
                      (onPlayerClick ? " pt-row--clickable" : "")
                    }
                    onClick={
                      onPlayerClick ? () => onPlayerClick(player) : undefined
                    }
                  >
                    <td className="td-rank">{index + 1}</td>

                    <td
                      className="td-star"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={"btn-star " + (isStarred ? "starred" : "")}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWatchlist(player);
                        }}
                        title={
                          isStarred
                            ? "Remove from watchlist"
                            : "Add to watchlist"
                        }
                      >
                        <Star size={15} fill={isStarred ? "#fbbf24" : "none"} />
                      </button>
                    </td>

                    <td className="td-player">
                      <div className="player-cell">
                        <PlayerHeadshot
                          src={player.headshot}
                          name={player.name}
                          isCustom={isCustomPlayer?.(player.id)}
                        />
                        <div className="player-name-col">
                          <span className="player-name">
                            {player.name}
                            {player.injuryStatus && (
                              <span className="pt-il-badge">
                                {player.injuryStatus.replace("DL", "IL")}
                              </span>
                            )}
                          </span>
                          {isCustomPlayer?.(player.id) && (
                            <span className="custom-badge">Custom</span>
                          )}
                          {(tags.length > 0 ||
                            hasRosterMapEntryForCatalogPlayer(draftedByTeam, player) ||
                            hasRosterMapEntryForCatalogPlayer(
                              draftedContractByPlayerId,
                              player,
                            )) && (
                            <div className="tag-list">
                              {tags.map((t) => (
                                <span key={t} className="tag">
                                  {t}
                                </span>
                              ))}
                              {draftedTeamName && (
                                <span className="tag pt-drafted-tag">
                                  ▶ {draftedTeamName}
                                </span>
                              )}
                              {draftedContractLabel && (
                                <span className="tag pt-drafted-contract-tag">
                                  {draftedContractLabel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="td-pos">
                      {player.positions && player.positions.length > 1 ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "2px",
                            flexWrap: "wrap",
                          }}
                        >
                          {player.positions.map((pos) => (
                            <PosBadge key={pos} pos={pos} />
                          ))}
                        </div>
                      ) : (
                        <PosBadge pos={player.position} />
                      )}
                    </td>
                    <td className="td-team">{player.team}</td>

                    <td
                      className="td-tier"
                      title={
                        eng && eng.tier !== player.tier
                          ? `List tier ${player.tier}`
                          : undefined
                      }
                    >
                      <TierBadge tier={eng?.tier ?? player.tier} />
                    </td>

                    <td className="td-adp">{player.adp}</td>

                    <td className="td-value">
                      <span
                        className="value-chip"
                        title="General auction guidance based on player strength and market conditions."
                      >
                        {formatCurrencyWhole(primaryValue)}
                      </span>
                      <div
                        style={{
                          fontSize: "0.62rem",
                          opacity: 0.78,
                          lineHeight: 1.1,
                          marginTop: "1px",
                        }}
                        title="Personalized value based on your roster needs and budget."
                      >
                        {valuationSortLabel("team_adjusted_value")}:{" "}
                        {formatCurrencyWhole(secondaryValue)}
                      </div>
                    </td>

                    <td
                      className={
                        "td-valdiff " +
                        (valDiff == null ? "" : valDiff >= 0 ? "pos" : "neg")
                      }
                    >
                      {formatMaybeDelta(valDiff)}
                    </td>

                    {focusedCols
                      ? focusedCols.map((col, i) => (
                          <td key={i} className="td-stat">
                            {getDisplayStatValue(
                              col,
                              focusedType!,
                              bat,
                              pit,
                              player,
                              statBasis,
                            )}
                          </td>
                        ))
                      : Array.from({ length: numStatCols }, (_, i) => (
                          <td key={i} className="td-stat">
                            {isBatter
                              ? batCols[i]
                                ? getDisplayStatValue(
                                    batCols[i],
                                    "batting",
                                    bat,
                                    pit,
                                    player,
                                    statBasis,
                                  )
                                : "-"
                              : pitCols[i]
                                ? getDisplayStatValue(
                                    pitCols[i],
                                    "pitching",
                                    bat,
                                    pit,
                                    player,
                                    statBasis,
                                  )
                                : "-"}
                          </td>
                        ))}

                    <td
                      className="td-notes"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {getNote && onNoteChange && (
                        <NoteCell
                          playerId={player.id}
                          playerName={player.name}
                          tags={tags}
                          getNote={getNote}
                          onNoteChange={onNoteChange}
                        />
                      )}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-footer">
        Showing {displayed.length} players · {statBasisFooterLine} · Data via
        MLB Stats API
      </div>
    </div>
  );
}
