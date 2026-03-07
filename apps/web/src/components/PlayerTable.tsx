import { useState } from "react";
import { Search, Star, RotateCcw } from "lucide-react";
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

function getCategoryTags(player: Player, statBasis: StatBasis): string[] {
  const tags: string[] = [];
  const { bat, pit } = resolveDisplayStats(player, statBasis);

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

function getValDiff(player: Player): number {
  // Val diff = projected value vs ADP-implied value (placeholder: value - adp-based estimate)
  const adpValue = Math.max(1, Math.round(50 - player.adp * 0.3));
  return player.value - adpValue;
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
}: PlayerTableProps) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [starredOnly, setStarredOnly] = useState(false);

  const toggleWatchlist = (player: Player) => {
    if (isInWatchlist(player.id)) removeFromWatchlist(player.id);
    else addToWatchlist(player);
  };

  const statBasisLabel =
    statBasis === "projections"
      ? "PROJ"
      : statBasis === "last-year"
        ? "2024"
        : "3YR";

  const displayed = starredOnly
    ? players.filter((p) => isInWatchlist(p.id))
    : players;

  return (
    <div className="pt-container">
      {/* ── Top controls bar ── */}
      <div className="pt-controls">
        <div className="pt-search">
          <Search size={15} className="pt-search-icon" />
          <input
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
                        ? "2024"
                        : "3YR"}
                  </button>
                ),
              )}
            </div>
          )}

          <button
            className="pt-icon-btn"
            title="Reset filters"
            onClick={() => {
              onSearchChange("");
              onPositionChange("all");
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
              <th className="th-avg">AVG/ERA</th>
              <th className="th-stat">HR/K</th>
              <th className="th-stat">RBI/W</th>
              <th className="th-stat">R/SV</th>
              <th className="th-stat">SB/WHIP</th>
              <th className="th-tags">Tags</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr>
                <td colSpan={15} className="pt-empty">
                  No players found.
                </td>
              </tr>
            )}
            {displayed.map((player, index) => {
              const tags = getCategoryTags(player, statBasis);
              const valDiff = getValDiff(player);
              const isStarred = isInWatchlist(player.id);
              const { bat, pit } = resolveDisplayStats(player, statBasis);
              const isBatter = !!bat || !pit;

              return (
                <tr
                  key={player.id}
                  className={"pt-row" + (isStarred ? " pt-row--starred" : "")}
                >
                  <td className="td-rank">{index + 1}</td>

                  <td className="td-star">
                    <button
                      className={"btn-star " + (isStarred ? "starred" : "")}
                      onClick={() => toggleWatchlist(player)}
                      title={
                        isStarred ? "Remove from watchlist" : "Add to watchlist"
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
                      <span className="player-name">{player.name}</span>
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

                  <td className="td-stat">
                    {isBatter ? (bat?.avg ?? "-") : (pit?.era ?? "-")}
                  </td>
                  <td className="td-stat">
                    {isBatter ? (bat?.hr ?? "-") : (pit?.strikeouts ?? "-")}
                  </td>
                  <td className="td-stat">
                    {isBatter ? (bat?.rbi ?? "-") : (pit?.wins ?? "-")}
                  </td>
                  <td className="td-stat">
                    {isBatter ? (bat?.runs ?? "-") : (pit?.saves ?? "-")}
                  </td>
                  <td className="td-stat">
                    {isBatter ? (bat?.sb ?? "-") : (pit?.whip ?? "-")}
                  </td>

                  <td className="td-tags">
                    <div className="tag-list">
                      {tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
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
