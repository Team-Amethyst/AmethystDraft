import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, RotateCcw, Tag } from "lucide-react";
import type { Player } from "../types/player";
import { useWatchlist } from "../contexts/WatchlistContext";
import "./PlayerTable.css";

type StatBasis = "projections" | "last-year" | "3-year-avg";

interface PlayerTableProps {
  players: Player[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  positionFilter: string;
  onPositionChange: (position: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  statBasis?: StatBasis;
  onStatBasisChange?: (basis: StatBasis) => void;
  onPlayerClick?: (player: Player) => void;
  scoringCategories?: { name: string; type: "batting" | "pitching" }[];
  getNote?: (playerId: string) => string;
  onNoteChange?: (playerId: string, note: string) => void;
  draftedIds?: Set<string>;
}

type DisplayBatting = {
  avg: string;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
};

type DisplayPitching = {
  era: string;
  whip: string;
  wins: number;
  saves: number;
  strikeouts: number;
};

const POSITIONS = ["all", "OF", "SS", "1B", "2B", "3B", "C", "DH", "SP", "RP"];

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

function PlayerHeadshot({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (failed) {
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
// NOTE: Dummy transformations below to simulate stat basis changes, replace with real data from backend when available.
function clampNonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

function formatRate(value: number): string {
  return value.toFixed(3);
}

function toDisplayBatting(
  batting?: Player["projection"]["batting"] | Player["stats"]["batting"],
): DisplayBatting | undefined {
  if (!batting) return undefined;
  return {
    avg: String(batting.avg ?? "0.000"),
    hr: Number(batting.hr ?? 0),
    rbi: Number(batting.rbi ?? 0),
    runs: Number(batting.runs ?? 0),
    sb: Number(batting.sb ?? 0),
  };
}

function toDisplayPitching(
  pitching?: Player["projection"]["pitching"] | Player["stats"]["pitching"],
): DisplayPitching | undefined {
  if (!pitching) return undefined;
  return {
    era: String(pitching.era ?? "0.000"),
    whip: String(pitching.whip ?? "0.000"),
    wins: Number(pitching.wins ?? 0),
    saves: Number(pitching.saves ?? 0),
    strikeouts: Number(pitching.strikeouts ?? 0),
  };
}

function applyDummyAdjustments(
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
  statBasis: StatBasis,
): { bat?: DisplayBatting; pit?: DisplayPitching } {
  if (statBasis === "projections") {
    return { bat, pit };
  }

  // TODO(data): Replace this dummy basis transformation with real 2024 and 3-year datasets from backend.
  if (statBasis === "last-year") {
    return {
      bat: bat
        ? {
            avg: formatRate(parseFloat(bat.avg) * 0.985),
            hr: clampNonNegative(bat.hr * 1.08),
            rbi: clampNonNegative(bat.rbi * 1.04),
            runs: clampNonNegative(bat.runs * 0.97),
            sb: clampNonNegative(bat.sb * 0.94),
          }
        : undefined,
      pit: pit
        ? {
            era: formatRate(parseFloat(pit.era) * 1.06),
            whip: formatRate(parseFloat(pit.whip) * 1.04),
            wins: clampNonNegative(pit.wins * 0.96),
            saves: clampNonNegative(pit.saves * 1.03),
            strikeouts: clampNonNegative(pit.strikeouts * 1.02),
          }
        : undefined,
    };
  }

  return {
    bat: bat
      ? {
          avg: formatRate(parseFloat(bat.avg) * 0.995),
          hr: clampNonNegative(bat.hr * 0.95),
          rbi: clampNonNegative(bat.rbi * 0.96),
          runs: clampNonNegative(bat.runs * 0.96),
          sb: clampNonNegative(bat.sb * 0.92),
        }
      : undefined,
    pit: pit
      ? {
          era: formatRate(parseFloat(pit.era) * 1.02),
          whip: formatRate(parseFloat(pit.whip) * 1.01),
          wins: clampNonNegative(pit.wins * 0.94),
          saves: clampNonNegative(pit.saves * 0.95),
          strikeouts: clampNonNegative(pit.strikeouts * 0.95),
        }
      : undefined,
  };
}

function resolveDisplayStats(
  player: Player,
  statBasis: StatBasis,
): { bat?: DisplayBatting; pit?: DisplayPitching } {
  const preferredBat =
    statBasis === "projections"
      ? player.projection?.batting
      : player.stats?.batting;
  const fallbackBat =
    statBasis === "projections"
      ? player.stats?.batting
      : player.projection?.batting;
  const preferredPit =
    statBasis === "projections"
      ? player.projection?.pitching
      : player.stats?.pitching;
  const fallbackPit =
    statBasis === "projections"
      ? player.stats?.pitching
      : player.projection?.pitching;

  const bat = toDisplayBatting(preferredBat ?? fallbackBat);
  const pit = toDisplayPitching(preferredPit ?? fallbackPit);

  return applyDummyAdjustments(bat, pit, statBasis);
}

function getCategoryTags(
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
): string[] {
  const tags: string[] = [];

  if (bat) {
    if (bat.hr >= 30) tags.push("HR+");
    if (bat.sb >= 20) tags.push("SB+");
    if (parseFloat(bat.avg) >= 0.29) tags.push("AVG+");
    if (bat.runs >= 100) tags.push("R+");
    if (bat.rbi >= 100) tags.push("RBI+");
  }
  if (pit) {
    if (pit.strikeouts >= 200) tags.push("K+");
    if (pit.wins >= 12) tags.push("W+");
    if (pit.saves >= 25) tags.push("SV+");
  }
  return tags;
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

function getValDiff(player: Player): number {
  const adpValue = Math.max(1, Math.round(50 - player.adp * 0.3));
  return player.value - adpValue;
}

const DEFAULT_BAT_COLS = ["AVG", "HR", "RBI", "R", "SB"];
const DEFAULT_PIT_COLS = ["ERA", "K", "W", "SV", "WHIP"];

function getDisplayStatValue(
  catName: string,
  catType: "batting" | "pitching",
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
  player: Player,
): string {
  const n = catName.toUpperCase();
  if (catType === "batting") {
    if (!bat && !player.stats?.batting) return "-";
    switch (n) {
      case "HR":
        return String(bat?.hr ?? "-");
      case "RBI":
        return String(bat?.rbi ?? "-");
      case "R":
      case "RUNS":
        return String(bat?.runs ?? "-");
      case "SB":
        return String(bat?.sb ?? "-");
      case "AVG":
        return bat?.avg ?? "-";
      case "OBP":
        return player.stats?.batting?.obp ?? "-";
      case "SLG":
        return player.stats?.batting?.slg ?? "-";
      default:
        return "-";
    }
  } else {
    if (!pit && !player.stats?.pitching) return "-";
    switch (n) {
      case "W":
      case "WINS":
        return String(pit?.wins ?? "-");
      case "K":
      case "SO":
        return String(pit?.strikeouts ?? "-");
      case "ERA":
        return pit?.era ?? "-";
      case "WHIP":
      case "WALKS + HITS PER IP":
        return pit?.whip ?? "-";
      case "SV":
      case "SAVES":
        return String(pit?.saves ?? "-");
      case "IP":
        return player.stats?.pitching?.innings ?? "-";
      default:
        return "-";
    }
  }
}

export default function PlayerTable({
  players,
  searchQuery,
  onSearchChange,
  positionFilter,
  onPositionChange,
  sortBy,
  onSortChange,
  statBasis = "projections",
  onStatBasisChange,
  onPlayerClick,
  scoringCategories,
  getNote,
  onNoteChange,
  draftedIds,
}: PlayerTableProps) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [starredOnly, setStarredOnly] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "drafted">("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const ALL_TAGS = ["HR+", "SB+", "AVG+", "R+", "RBI+", "K+", "W+", "SV+"];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
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

  const batCols = useMemo(() => {
    const cats = (scoringCategories ?? []).filter((c) => c.type === "batting");
    return cats.length > 0 ? cats.map((c) => c.name) : DEFAULT_BAT_COLS;
  }, [scoringCategories]);

  const pitCols = useMemo(() => {
    const cats = (scoringCategories ?? []).filter((c) => c.type === "pitching");
    return cats.length > 0 ? cats.map((c) => c.name) : DEFAULT_PIT_COLS;
  }, [scoringCategories]);

  const numStatCols = Math.max(batCols.length, pitCols.length);

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

  const statBasisLabel =
    statBasis === "projections"
      ? "PROJ"
      : statBasis === "last-year"
        ? "2025"
        : "3YR";

  const displayed = useMemo(() => {
    let base = starredOnly ? players.filter((p) => isInWatchlist(p.id)) : players;
    if (availabilityFilter === "available") base = base.filter((p) => !draftedIds?.has(p.id));
    else if (availabilityFilter === "drafted") base = base.filter((p) => draftedIds?.has(p.id));
    return base;
  }, [players, starredOnly, availabilityFilter, draftedIds, isInWatchlist]);

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
          valDiff: getValDiff(player),
        };
      }),
    [displayed, statBasis],
  );

  const filteredRowData = useMemo(
    () =>
      selectedTags.size === 0
        ? allRowData
        : allRowData.filter((r) =>
            [...selectedTags].every((t) => r.tags.includes(t)),
          ),
    [allRowData, selectedTags],
  );

  const rowData = useMemo(
    () => (fullyRendered ? filteredRowData : filteredRowData.slice(0, INITIAL_ROWS)),
    [filteredRowData, fullyRendered],
  );

  return (
    <div className="pt-container">
      {/* ── Top controls bar ── */}
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
            onChange={(e) => setAvailabilityFilter(e.target.value as "all" | "available" | "drafted")}
          >
            <option value="all">Availability (All)</option>
            <option value="available">Available</option>
            <option value="drafted">Drafted</option>
          </select>

          <select
            className="pt-select"
            value={positionFilter}
            onChange={(e) => onPositionChange(e.target.value)}
          >
            <option value="all">Position (All)</option>
            {POSITIONS.slice(1).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="pt-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="value">Sort: Value</option>
            <option value="adp">Sort: ADP</option>
            <option value="name">Sort: Name</option>
          </select>

          <button
            className={"pt-toggle " + (starredOnly ? "active" : "")}
            onClick={() => setStarredOnly((v) => !v)}
          >
            <Star size={13} fill={starredOnly ? "#fbbf24" : "none"} />
            Starred only
          </button>

          {onStatBasisChange && (
            <div className="pt-basis-pills">
              {(["projections", "last-year", "3-year-avg"] as const).map(
                (b) => (
                  <button
                    key={b}
                    className={"pt-pill " + (statBasis === b ? "active" : "")}
                    onClick={() => onStatBasisChange(b)}
                  >
                    {b === "projections"
                      ? "PROJ"
                      : b === "last-year"
                        ? "2025"
                        : "3YR"}
                  </button>
                ),
              )}
            </div>
          )}

          <div className="pt-tag-wrap">
            <button
              className={
                "pt-toggle " + (selectedTags.size > 0 ? "active" : "")
              }
              onClick={() => setTagDropdownOpen((v) => !v)}
            >
              <Tag size={13} />
              Tags{selectedTags.size > 0 ? ` (${selectedTags.size})` : ""}
            </button>
            {tagDropdownOpen && (
              <div className="pt-tag-dropdown" ref={tagDropdownRef}>
                {ALL_TAGS.map((tag) => (
                  <label key={tag} className="pt-tag-option">
                    <input
                      type="checkbox"
                      checked={selectedTags.has(tag)}
                      onChange={() => toggleTag(tag)}
                    />
                    <span className="tag">{tag}</span>
                  </label>
                ))}
                {selectedTags.size > 0 && (
                  <button
                    className="pt-tag-clear"
                    onClick={() => setSelectedTags(new Set())}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            className="pt-icon-btn"
            title="Reset filters"
            onClick={() => {
              onSearchChange("");
              onPositionChange("all");
              setSelectedTags(new Set());
              setAvailabilityFilter("all");
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

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
              <th className="th-tier">Tier</th>
              <th className="th-adp">ADP</th>
              <th className="th-value">Proj $</th>
              <th className="th-valdiff">Val Diff</th>
              {Array.from({ length: numStatCols }, (_, i) => {
                const b = batCols[i];
                const p = pitCols[i];
                const label = b && p ? `${b}/${p}` : (b ?? p ?? "");
                return (
                  <th key={i} className={i === 0 ? "th-avg" : "th-stat"}>
                    {label}
                  </th>
                );
              })}
              <th className="th-notes">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredRowData.length === 0 && (
              <tr>
                <td colSpan={10 + numStatCols} className="pt-empty">
                  No players found.
                </td>
              </tr>
            )}
            {rowData.map(
              ({ player, bat, pit, isBatter, tags, valDiff }, index) => {
                const isStarred = isInWatchlist(player.id);

                return (
                  <tr
                    key={player.id}
                    className={
                      "pt-row" +
                      (isStarred ? " pt-row--starred" : "") +
                      (draftedIds?.has(player.id) ? " pt-row--drafted" : "") +
                      (onPlayerClick ? " pt-row--clickable" : "")
                    }
                    onClick={
                      onPlayerClick ? () => onPlayerClick(player) : undefined
                    }
                  >
                    <td className="td-rank">{index + 1}</td>

                    <td className="td-star">
                      <button
                        className={"btn-star " + (isStarred ? "starred" : "")}
                        onClick={(e) => { e.stopPropagation(); toggleWatchlist(player); }}
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
                        />
                        <div className="player-name-col">
                          <span className="player-name">{player.name}</span>
                          {tags.length > 0 && (
                            <div className="tag-list">
                              {tags.map((t) => (
                                <span key={t} className="tag">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="td-pos">{player.position}</td>
                    <td className="td-team">{player.team}</td>

                    <td className="td-tier">
                      <TierBadge tier={player.tier} />
                    </td>

                    <td className="td-adp">{player.adp}</td>

                    <td className="td-value">
                      <span className="value-chip">${player.value}</span>
                    </td>

                    <td
                      className={"td-valdiff " + (valDiff >= 0 ? "pos" : "neg")}
                    >
                      {valDiff >= 0 ? "+" : ""}
                      {valDiff}
                    </td>

                    {Array.from({ length: numStatCols }, (_, i) => (
                      <td key={i} className="td-stat">
                        {isBatter
                          ? batCols[i]
                            ? getDisplayStatValue(
                                batCols[i],
                                "batting",
                                bat,
                                pit,
                                player,
                              )
                            : "-"
                          : pitCols[i]
                            ? getDisplayStatValue(
                                pitCols[i],
                                "pitching",
                                bat,
                                pit,
                                player,
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
        Showing {displayed.length} players · {statBasisLabel} stats · Data via
        MLB Stats API
      </div>
    </div>
  );
}
