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
import { PLAYER_TABLE_STORAGE_KEYS } from "../constants/playerTableStorage";
import { PlayerTableControls } from "./PlayerTableControls";
import {
  NoteCell,
  PlayerHeadshot,
  SortArrow,
  TierBadge,
} from "./PlayerTableParts";
import {
  formatCurrencyWhole,
  leagueWideAuctionDollars,
  RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY,
  RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE,
  valuationSortLabel,
  type ValuationSortField,
} from "../utils/valuation";
import {
  AUCTION_RANK_TOOLTIP,
  AUCTION_TIER_TOOLTIP,
  MARKET_ADP_COLUMN_TOOLTIP,
  MODEL_RANK_TOOLTIP,
  marketAdpDetailTooltip,
  MODEL_TIER_TOOLTIP,
} from "../domain/rankTierLabels";
import {
  displayAuctionTier,
  poolHasMarketAdp,
} from "../domain/playerRankTier";

/** Stat category badges (HR+, AVG+, …) — cap visible chips to keep the Research row compact. */
const MAX_VISIBLE_CATEGORY_TAGS = 3;

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
  defaultValuationSortField?: ValuationSortField;
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
  defaultValuationSortField = "auction_value",
}: PlayerTableProps) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [starredOnly, setStarredOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PLAYER_TABLE_STORAGE_KEYS.starred) === "true";
    } catch {
      return false;
    }
  });
  const [injuryFilter, setInjuryFilter] = useState<
    "all" | "healthy" | "injured"
  >(() => {
    try {
      return (
        (localStorage.getItem(PLAYER_TABLE_STORAGE_KEYS.injury) as
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
        (localStorage.getItem(PLAYER_TABLE_STORAGE_KEYS.availability) as
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
      const s = localStorage.getItem(PLAYER_TABLE_STORAGE_KEYS.tags);
      return s ? new Set(JSON.parse(s) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [statView, setStatView] = useState<"all" | "hitting" | "pitching">(
    () => {
      try {
        return (
          (localStorage.getItem(PLAYER_TABLE_STORAGE_KEYS.statView) as
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
      const s = localStorage.getItem(PLAYER_TABLE_STORAGE_KEYS.sort);
      if (!s) return { col: "catalog_rank", dir: "asc" as const };
      const parsed = JSON.parse(s) as { col?: unknown; dir?: unknown };
      let col = typeof parsed.col === "string" ? parsed.col : "catalog_rank";
      if (col === "adp") col = "catalog_rank";
      const dir = parsed.dir === "desc" ? ("desc" as const) : ("asc" as const);
      if (col === "valdiff") return { col: "catalog_rank", dir: "asc" };
      return { col, dir };
    } catch {
      return { col: "catalog_rank", dir: "asc" as const };
    }
  });
  const valuationSortField: ValuationSortField = defaultValuationSortField;

  useEffect(() => {
    try {
      localStorage.setItem(
        PLAYER_TABLE_STORAGE_KEYS.starred,
        String(starredOnly),
      );
    } catch {
      /* noop */
    }
  }, [starredOnly]);
  useEffect(() => {
    try {
      localStorage.setItem(PLAYER_TABLE_STORAGE_KEYS.injury, injuryFilter);
    } catch {
      /* noop */
    }
  }, [injuryFilter]);
  useEffect(() => {
    try {
      localStorage.setItem(
        PLAYER_TABLE_STORAGE_KEYS.availability,
        availabilityFilter,
      );
    } catch {
      /* noop */
    }
  }, [availabilityFilter]);
  useEffect(() => {
    try {
      localStorage.setItem(
        PLAYER_TABLE_STORAGE_KEYS.tags,
        JSON.stringify([...selectedTags]),
      );
    } catch {
      /* noop */
    }
  }, [selectedTags]);
  useEffect(() => {
    try {
      localStorage.setItem(
        PLAYER_TABLE_STORAGE_KEYS.sort,
        JSON.stringify(clientSort),
      );
    } catch {
      /* noop */
    }
  }, [clientSort]);
  useEffect(() => {
    try {
      localStorage.setItem(PLAYER_TABLE_STORAGE_KEYS.statView, statView);
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
      const defaultAsc =
        col === "catalog_rank" ||
        col === "adp" ||
        col === "auction_rank" ||
        col === "market_adp" ||
        col === "tier" ||
        col === "auction_tier";
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

  const showAuctionRankCol = useMemo(
    () =>
      players.some(
        (p) =>
          typeof p.auction_rank === "number" && Number.isFinite(p.auction_rank),
      ),
    [players],
  );
  const showMarketAdpCol = useMemo(() => poolHasMarketAdp(players), [players]);
  const tierHeaderUsesAuction = useMemo(
    () =>
      players.some(
        (p) =>
          typeof p.auction_tier === "number" &&
          Number.isFinite(p.auction_tier),
      ),
    [players],
  );
  const tableFixedCols =
    9 + (showAuctionRankCol ? 1 : 0) + (showMarketAdpCol ? 1 : 0);

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
                title={
                  tierHeaderUsesAuction
                    ? AUCTION_TIER_TOOLTIP
                    : MODEL_TIER_TOOLTIP
                }
                onClick={() => handleColSort("tier")}
              >
                {tierHeaderUsesAuction ? "Auction tier" : "Model tier"}{" "}
                <SortArrow col="tier" sort={clientSort} />
              </th>
              <th
                className="th-adp th-sortable"
                title={MODEL_RANK_TOOLTIP}
                onClick={() => handleColSort("catalog_rank")}
              >
                Model rank <SortArrow col="catalog_rank" sort={clientSort} />
              </th>
              {showAuctionRankCol && (
                <th
                  className="th-sortable"
                  title={AUCTION_RANK_TOOLTIP}
                  onClick={() => handleColSort("auction_rank")}
                >
                  Auction rank{" "}
                  <SortArrow col="auction_rank" sort={clientSort} />
                </th>
              )}
              {showMarketAdpCol && (
                <th
                  className="th-sortable"
                  title={MARKET_ADP_COLUMN_TOOLTIP}
                  onClick={() => handleColSort("market_adp")}
                >
                  Market ADP{" "}
                  <SortArrow col="market_adp" sort={clientSort} />
                </th>
              )}
              <th
                className="th-value th-sortable"
                onClick={() => handleColSort("value")}
                title={RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE}
              >
                {valuationSortLabel("auction_value")}{" "}
                <SortArrow col="value" sort={clientSort} />
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
                <td colSpan={tableFixedCols + numActiveCols} className="pt-empty">
                  No players found.
                </td>
              </tr>
            )}
            {rowData.map(
              ({ player, bat, pit, isBatter, tags }, index) => {
                const isStarred = isInWatchlist(player.id);
                const primaryValue = leagueWideAuctionDollars(player);
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
                              {tags.slice(0, MAX_VISIBLE_CATEGORY_TAGS).map((t) => (
                                <span key={t} className="tag">
                                  {t}
                                </span>
                              ))}
                              {tags.length > MAX_VISIBLE_CATEGORY_TAGS ? (
                                <span
                                  className="tag tag--overflow"
                                  title={tags.slice(MAX_VISIBLE_CATEGORY_TAGS).join(", ")}
                                >
                                  +{tags.length - MAX_VISIBLE_CATEGORY_TAGS}
                                </span>
                              ) : null}
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
                        <div className="pt-pos-badges">
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
                        typeof player.auction_tier === "number" &&
                        player.auction_tier !== player.catalog_tier
                          ? `Model tier ${player.catalog_tier}`
                          : undefined
                      }
                    >
                      <TierBadge tier={displayAuctionTier(player) ?? 1} />
                    </td>

                    <td className="td-adp">{player.catalog_rank}</td>
                    {showAuctionRankCol && (
                      <td className="td-stat">
                        {typeof player.auction_rank === "number" &&
                        Number.isFinite(player.auction_rank)
                          ? player.auction_rank
                          : "—"}
                      </td>
                    )}
                    {showMarketAdpCol && (
                      <td
                        className="td-stat"
                        title={marketAdpDetailTooltip(player)}
                      >
                        {typeof player.market_adp === "number" &&
                        Number.isFinite(player.market_adp)
                          ? player.market_adp
                          : "—"}
                      </td>
                    )}

                    <td className="td-value">
                      <div className="pt-value-stack">
                        <span
                          className="value-chip pt-value-stack__primary"
                          title={RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE}
                        >
                          {formatCurrencyWhole(primaryValue)}
                        </span>
                      </div>
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
        <span className="pt-footer-line">
          Showing {displayed.length} players · {statBasisFooterLine} · Data via
          MLB Stats API
        </span>
        <span className="pt-footer-line pt-footer-line--subtle">
          {RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY}
        </span>
      </div>
    </div>
  );
}
