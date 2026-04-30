import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, RotateCcw, Tag } from "lucide-react";
import type { Player } from "../types/player";
import { useWatchlist } from "../contexts/WatchlistContext";
import PosBadge from "./PosBadge";
import "./PlayerTable.css";
import {
  formatCurrencyWhole,
  formatMaybeDelta,
  valuationSortLabel,
  type ValuationSortField,
} from "../utils/valuation";
import CustomPlayerHeadshot from "./CustomPlayerHeadshot";


type StatBasis = "projections" | "last-year" | "3-year-avg";

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
  holds: number;
  strikeouts: number;
  completeGames: number;
};

const POSITIONS = ["all", "OF", "SS", "1B", "2B", "3B", "C", "DH", "P"];
const HITTER_POSITIONS = ["OF", "SS", "1B", "2B", "3B", "C", "DH"];
const PITCHER_POSITION_LIST = ["P"];

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
    holds: Number(pitching.holds ?? 0),
    strikeouts: Number(pitching.strikeouts ?? 0),
    completeGames: Number(pitching.completeGames ?? 0),
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
            holds: clampNonNegative(pit.holds * 1.03),
            strikeouts: clampNonNegative(pit.strikeouts * 1.02),
            completeGames: clampNonNegative(pit.completeGames * 0.96),
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
          holds: clampNonNegative(pit.holds * 0.95),
          strikeouts: clampNonNegative(pit.strikeouts * 0.95),
          completeGames: clampNonNegative(pit.completeGames * 0.94),
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
    if (bat.hr >= 25) tags.push("HR+");
    if (bat.sb >= 15) tags.push("SB+");
    if (parseFloat(bat.avg) >= 0.285) tags.push("AVG+");
    if (bat.runs >= 85) tags.push("R+");
    if (bat.rbi >= 85) tags.push("RBI+");
  }
  if (pit) {
    if (pit.strikeouts >= 175) tags.push("K+");
    if (pit.wins >= 10) tags.push("W+");
    if (pit.saves >= 20) tags.push("SV+");
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

function asFinite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function getValDiff(player: Player): number | undefined {
  const edge = asFinite(player.edge);
  if (edge !== undefined) return edge;
  const likelyBid = asFinite(player.recommended_bid);
  const yourValue = asFinite(player.team_adjusted_value);
  if (likelyBid !== undefined && yourValue !== undefined) {
    return yourValue - likelyBid;
  }
  return undefined;
}

const DEFAULT_BAT_COLS = ["AVG", "HR", "RBI", "R", "SB"];
const DEFAULT_PIT_COLS = ["ERA", "K", "W", "SV", "WHIP"];

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);
function playerIsPitcher(p: Player): boolean {
  const hasPit = !!(p.projection?.pitching ?? p.stats?.pitching);
  const hasBat = !!(p.projection?.batting ?? p.stats?.batting);
  if (hasPit && !hasBat) return true;
  if (hasBat && !hasPit) return false;
  return PITCHER_POSITIONS.has(p.position.toUpperCase());
}

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
      case "HLD":
      case "HOLDS":
        return String(pit?.holds ?? "-");
      case "CG":
      case "COMPLETE GAMES":
        return String(pit?.completeGames ?? "-");
      case "IP":
        return player.stats?.pitching?.innings ?? "-";
      default:
        return "-";
    }
  }
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
  const [valuationSortField, setValuationSortField] =
    useState<ValuationSortField>(defaultValuationSortField);

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

  const ALL_TAGS = ["HR+", "SB+", "AVG+", "R+", "RBI+", "K+", "W+", "SV+"];

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

  const batCols = useMemo(() => {
    const cats = (scoringCategories ?? []).filter((c) => c.type === "batting");
    return cats.length > 0
      ? cats.map((c) => c.name.match(/\(([^)]+)\)$/)?.[1] ?? c.name)
      : DEFAULT_BAT_COLS;
  }, [scoringCategories]);

  const pitCols = useMemo(() => {
    const cats = (scoringCategories ?? []).filter((c) => c.type === "pitching");
    return cats.length > 0
      ? cats.map((c) => c.name.match(/\(([^)]+)\)$/)?.[1] ?? c.name)
      : DEFAULT_PIT_COLS;
  }, [scoringCategories]);

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

  const statBasisLabel =
    statBasis === "projections"
      ? "PROJ"
      : statBasis === "last-year"
        ? "2025"
        : "3YR";

  // Determine pitcher by stats presence (same heuristic as isBatter below),
  // falling back to position string so list works even with sparse data.
  const displayed = useMemo(() => {
    let base = starredOnly
      ? players.filter((p) => isInWatchlist(p.id))
      : players;
    if (availabilityFilter === "available")
      base = base.filter((p) => !draftedIds?.has(p.id));
    else if (availabilityFilter === "drafted")
      base = base.filter((p) => draftedIds?.has(p.id));
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

  const sortedRowData = useMemo(() => {
    const { col, dir } = clientSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...filteredRowData].sort((a, b) => {
      if (col === "adp") return mult * (a.player.adp - b.player.adp);
      if (col === "value") {
        const av =
          valuationSortField === "recommended_bid"
            ? asFinite(a.player.recommended_bid) ?? -Infinity
            : valuationSortField === "team_adjusted_value"
              ? asFinite(a.player.team_adjusted_value) ?? -Infinity
              : asFinite(a.player[valuationSortField]) ?? -Infinity;
        const bv =
          valuationSortField === "recommended_bid"
            ? asFinite(b.player.recommended_bid) ?? -Infinity
            : valuationSortField === "team_adjusted_value"
              ? asFinite(b.player.team_adjusted_value) ?? -Infinity
              : asFinite(b.player[valuationSortField]) ?? -Infinity;
        return mult * (av - bv);
      }
      if (col === "tier") return mult * (a.player.tier - b.player.tier);
      if (col === "valdiff") {
        const av = a.valDiff ?? -Infinity;
        const bv = b.valDiff ?? -Infinity;
        return mult * (av - bv);
      }
      if (col.startsWith("stat-")) {
        const i = parseInt(col.slice(5));
        const aStat = a.isBatter ? batCols[i] : pitCols[i];
        const bStat = b.isBatter ? batCols[i] : pitCols[i];
        const aRaw = aStat
          ? getDisplayStatValue(
              aStat,
              a.isBatter ? "batting" : "pitching",
              a.bat,
              a.pit,
              a.player,
            )
          : "-";
        const bRaw = bStat
          ? getDisplayStatValue(
              bStat,
              b.isBatter ? "batting" : "pitching",
              b.bat,
              b.pit,
              b.player,
            )
          : "-";
        const aP = parseFloat(aRaw);
        const bP = parseFloat(bRaw);
        return (
          mult * ((isNaN(aP) ? -Infinity : aP) - (isNaN(bP) ? -Infinity : bP))
        );
      }
      return 0;
    });
  }, [filteredRowData, clientSort, batCols, pitCols, valuationSortField]);

  const rowData = useMemo(
    () =>
      fullyRendered ? sortedRowData : sortedRowData.slice(0, INITIAL_ROWS),
    [sortedRowData, fullyRendered],
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
            onChange={(e) =>
              setAvailabilityFilter(
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
              setStatView(v);
              if (
                v === "hitting" &&
                !HITTER_POSITIONS.includes(positionFilter)
              ) {
                onPositionChange("all");
              } else if (v === "pitching" && positionFilter !== "P") {
                onPositionChange("all");
              }
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
            {(statView === "hitting"
              ? HITTER_POSITIONS
              : statView === "pitching"
                ? PITCHER_POSITION_LIST
                : POSITIONS.slice(1)
            ).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="pt-select"
            value={injuryFilter}
            onChange={(e) =>
              setInjuryFilter(e.target.value as "all" | "healthy" | "injured")
            }
          >
            <option value="all">Health (All)</option>
            <option value="healthy">Healthy only</option>
            <option value="injured">Injured only</option>
          </select>

          <button
            className={"pt-toggle " + (starredOnly ? "active" : "")}
            onClick={() => setStarredOnly((v) => !v)}
          >
            <Star size={13} fill={starredOnly ? "#fbbf24" : "none"} />
            Starred only
          </button>
          <select
            className="pt-select"
            value={valuationSortField}
            onChange={(e) =>
              setValuationSortField(e.target.value as ValuationSortField)
            }
            title="Sort by valuation field"
          >
            <option value="team_adjusted_value">Sort by: Your Value</option>
            <option value="recommended_bid">Sort by: Likely Bid</option>
            <option value="adjusted_value">Sort by: Market Value</option>
            <option value="baseline_value">Sort by: Player Strength</option>
          </select>

          <div className="pt-tag-wrap">
            <button
              className={"pt-toggle " + (selectedTags.size > 0 ? "active" : "")}
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
              setInjuryFilter("all");
              setStatView("all");
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
        {onStatBasisChange && (
          <div className="pt-basis-pills">
            {(["projections", "last-year", "3-year-avg"] as const).map((b) => (
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
            ))}
          </div>
        )}
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
                            draftedByTeam?.has(player.id) ||
                            draftedContractByPlayerId?.has(player.id)) && (
                            <div className="tag-list">
                              {tags.map((t) => (
                                <span key={t} className="tag">
                                  {t}
                                </span>
                              ))}
                              {draftedByTeam?.get(player.id) && (
                                <span className="tag pt-drafted-tag">
                                  ▶ {draftedByTeam.get(player.id)}
                                </span>
                              )}
                              {draftedContractByPlayerId?.get(player.id) && (
                                <span className="tag pt-drafted-contract-tag">
                                  {draftedContractByPlayerId.get(player.id)}
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
