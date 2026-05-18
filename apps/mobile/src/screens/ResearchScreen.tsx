import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { getValuation, type ValuationResult } from "../api/engine";
import { getRoster, type RosterEntry } from "../api/roster";
import {
  getDepthChartCached,
  getPlayers,
  getPlayersCached,
  getTeamDepthChart,
  type DepthChartPlayerRow,
  type DepthChartPosition,
  type DepthChartResponse,
} from "../api/players";
import PlayerDetailModal from "../components/PlayerDetailModal";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import {
  type StatBasis,
  formatResearchStatSummaryLine,
  parseStatBasis,
  RESEARCH_STAT_BASIS_STORAGE_KEY_MOBILE,
} from "@repo/player-stat-basis";

type Props = BottomTabScreenProps<LeagueTabParamList, "Research">;

type ResearchView = "player-database" | "tiers" | "depth-charts";
type AvailabilityFilter = "all" | "available" | "drafted";
type InjuryFilter = "all" | "healthy" | "injured";
type StatViewFilter = "all" | "hitting" | "pitching";
type SortDirection = "asc" | "desc";
type ControlPanel = "filters" | "sort" | "tags" | null;
type TagFilter = "HR+" | "SB+" | "AVG+" | "R+" | "RBI+" | "K+" | "W+" | "SV+";

type ResearchSort =
  | "auction_value"
  | "auction_rank"
  | "market_adp"
  | "name"
  | "tier"
  | "r_w"
  | "hr_k"
  | "rbi_era"
  | "sb_whip"
  | "avg_sv";

type PositionFilter =
  | "ALL"
  | "OF"
  | "SS"
  | "1B"
  | "2B"
  | "3B"
  | "C"
  | "DH"
  | "P";

const ALL_POSITION_FILTERS: PositionFilter[] = [
  "ALL",
  "OF",
  "SS",
  "1B",
  "2B",
  "3B",
  "C",
  "DH",
  "P",
];

const HITTER_POSITION_FILTERS: PositionFilter[] = [
  "ALL",
  "OF",
  "SS",
  "1B",
  "2B",
  "3B",
  "C",
  "DH",
];

const PITCHER_POSITION_FILTERS: PositionFilter[] = ["P"];

function positionFiltersForStatView(statViewFilter: StatViewFilter): PositionFilter[] {
  if (statViewFilter === "hitting") {
    return HITTER_POSITION_FILTERS;
  }

  if (statViewFilter === "pitching") {
    return PITCHER_POSITION_FILTERS;
  }

  return ALL_POSITION_FILTERS;
}

const SORT_OPTIONS: { label: string; value: ResearchSort }[] = [
  { label: "Auction $", value: "auction_value" },
  { label: "Auction Rank", value: "auction_rank" },
  { label: "Market ADP", value: "market_adp" },
  { label: "Name", value: "name" },
  { label: "Tier", value: "tier" },
  { label: "R / W", value: "r_w" },
  { label: "HR / K", value: "hr_k" },
  { label: "RBI / ERA", value: "rbi_era" },
  { label: "SB / WHIP", value: "sb_whip" },
  { label: "AVG / SV", value: "avg_sv" },
];

const TAG_OPTIONS: TagFilter[] = ["HR+", "SB+", "AVG+", "R+", "RBI+", "K+", "W+", "SV+"];

const DEPTH_POSITIONS: DepthChartPosition[] = [
  "SP",
  "RP",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
];

const MLB_TEAMS = [
  { id: 108, abbr: "LAA", name: "Los Angeles Angels" },
  { id: 109, abbr: "AZ", name: "Arizona Diamondbacks" },
  { id: 110, abbr: "BAL", name: "Baltimore Orioles" },
  { id: 111, abbr: "BOS", name: "Boston Red Sox" },
  { id: 112, abbr: "CHC", name: "Chicago Cubs" },
  { id: 113, abbr: "CIN", name: "Cincinnati Reds" },
  { id: 114, abbr: "CLE", name: "Cleveland Guardians" },
  { id: 115, abbr: "COL", name: "Colorado Rockies" },
  { id: 116, abbr: "DET", name: "Detroit Tigers" },
  { id: 117, abbr: "HOU", name: "Houston Astros" },
  { id: 118, abbr: "KC", name: "Kansas City Royals" },
  { id: 119, abbr: "LAD", name: "Los Angeles Dodgers" },
  { id: 120, abbr: "WSH", name: "Washington Nationals" },
  { id: 121, abbr: "NYM", name: "New York Mets" },
  { id: 133, abbr: "ATH", name: "Athletics" },
  { id: 134, abbr: "PIT", name: "Pittsburgh Pirates" },
  { id: 135, abbr: "SD", name: "San Diego Padres" },
  { id: 136, abbr: "SEA", name: "Seattle Mariners" },
  { id: 137, abbr: "SF", name: "San Francisco Giants" },
  { id: 138, abbr: "STL", name: "St. Louis Cardinals" },
  { id: 139, abbr: "TB", name: "Tampa Bay Rays" },
  { id: 140, abbr: "TEX", name: "Texas Rangers" },
  { id: 141, abbr: "TOR", name: "Toronto Blue Jays" },
  { id: 142, abbr: "MIN", name: "Minnesota Twins" },
  { id: 143, abbr: "PHI", name: "Philadelphia Phillies" },
  { id: 144, abbr: "ATL", name: "Atlanta Braves" },
  { id: 145, abbr: "CWS", name: "Chicago White Sox" },
  { id: 146, abbr: "MIA", name: "Miami Marlins" },
  { id: 147, abbr: "NYY", name: "New York Yankees" },
  { id: 158, abbr: "MIL", name: "Milwaukee Brewers" },
];

const HITTER_STAT_KEYS = ["R", "HR", "RBI", "SB", "AVG"];
const PITCHER_STAT_KEYS = ["W", "K", "ERA", "WHIP", "SV"];

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function valuationNumber(row: ValuationResult | undefined, key: string): number | null {
  if (!row) return null;

  const record = row as unknown as Record<string, unknown>;
  return finiteNumber(record[key]);
}

function playerNumber(player: Player, key: string): number | null {
  const record = player as unknown as Record<string, unknown>;
  return finiteNumber(record[key]);
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function playerMatchesValuationRow(player: Player, row: ValuationResult): boolean {
  const rowPlayerId = String(row.player_id);
  const playerRecord = player as unknown as Record<string, unknown>;

  if (player.id === rowPlayerId) {
    return true;
  }

  const mlbId =
    finiteNumber(playerRecord.mlbId) ??
    finiteNumber(playerRecord.mlb_id) ??
    finiteNumber(playerRecord.playerId);

  if (mlbId !== null && String(Math.round(mlbId)) === rowPlayerId) {
    return true;
  }

  const sameName =
    normalizeSearchText(player.name) === normalizeSearchText(row.name);
  const sameTeam =
    !row.team || normalizeSearchText(player.team) === normalizeSearchText(row.team);

  return sameName && sameTeam;
}

function positionMatches(player: Player, filter: PositionFilter): boolean {
  if (filter === "ALL") return true;

  if (filter === "P") {
    return isPitcher(player);
  }

  const normalizedPositions = [player.position, ...(player.positions ?? [])]
    .join("/")
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  if (filter === "OF") {
    return ["OF", "LF", "CF", "RF"].some((p) => normalizedPositions.includes(p));
  }

  return normalizedPositions.includes(filter);
}

function isPitcher(player: Player): boolean {
  const positions = [player.position, ...(player.positions ?? [])]
    .join("/")
    .toUpperCase();

  return (
    positions.includes("SP") ||
    positions.includes("RP") ||
    positions.includes("P")
  );
}

function hasHittingProfile(player: Player): boolean {
  const positions = [player.position, ...(player.positions ?? [])]
    .join("/")
    .toUpperCase();

  const data = player as unknown as {
    stats?: { batting?: Record<string, unknown> };
    projection?: { batting?: Record<string, unknown> };
    projections?: { batting?: Record<string, unknown> };
    stats3yr?: { batting?: Record<string, unknown> };
  };

  return (
    positions.includes("DH") ||
    positions.includes("UTIL") ||
    ["C", "1B", "2B", "SS", "3B", "OF", "LF", "CF", "RF"].some((pos) =>
      positions.includes(pos),
    ) ||
    Boolean(data.stats?.batting || data.projection?.batting || data.projections?.batting || data.stats3yr?.batting)
  );
}

function playerHasInjury(player: Player): boolean {
  return Boolean(player.injuryStatus && player.injuryStatus.trim());
}

function getAuctionValue(player: Player, row?: ValuationResult): number {
  return (
    valuationNumber(row, "auction_value") ??
    playerNumber(player, "auction_value") ??
    valuationNumber(row, "baseline_value") ??
    playerNumber(player, "value") ??
    player.value ??
    0
  );
}

function getAuctionRank(player: Player, row?: ValuationResult): number | null {
  return (
    valuationNumber(row, "auction_rank") ??
    playerNumber(player, "auction_rank")
  );
}

function getModelRank(player: Player, row?: ValuationResult): number | null {
  return (
    valuationNumber(row, "catalog_rank") ??
    playerNumber(player, "catalog_rank") ??
    playerNumber(player, "adp")
  );
}

function getMarketAdp(player: Player, row?: ValuationResult): number | null {
  return (
    valuationNumber(row, "market_adp") ??
    playerNumber(player, "market_adp")
  );
}

function getAuctionTier(player: Player, row?: ValuationResult): number {
  return (
    valuationNumber(row, "auction_tier") ??
    valuationNumber(row, "tier") ??
    playerNumber(player, "auction_tier") ??
    playerNumber(player, "catalog_tier") ??
    player.tier ??
    99
  );
}

function getModelTier(player: Player, row?: ValuationResult): number {
  return (
    valuationNumber(row, "catalog_tier") ??
    playerNumber(player, "catalog_tier") ??
    player.tier ??
    99
  );
}

function getDisplayTier(
  player: Player,
  row: ValuationResult | undefined,
  showEngineValues: boolean,
): number {
  if (showEngineValues) {
    return getAuctionTier(player, row);
  }

  return getModelTier(player, row);
}


function displayPosition(player: Player): string {
  const positions = player.positions?.length
    ? player.positions.join("/")
    : player.position;

  return positions || "—";
}

function tierColor(tier: number): { backgroundColor: string; borderColor: string; color: string } {
  if (tier === 1) {
    return { backgroundColor: "#a855f7", borderColor: "#c084fc", color: "#ffffff" };
  }

  if (tier === 2) {
    return { backgroundColor: "#2563eb", borderColor: "#60a5fa", color: "#ffffff" };
  }

  if (tier === 3) {
    return { backgroundColor: "#16a34a", borderColor: "#4ade80", color: "#ffffff" };
  }

  if (tier === 4) {
    return { backgroundColor: "#ca8a04", borderColor: "#facc15", color: "#111827" };
  }

  return { backgroundColor: "#374151", borderColor: "#9ca3af", color: "#ffffff" };
}

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `$${Math.round(value)}`;
}

function formatNumber(value: number | null, digits = 0): string {
  if (value === null) return "—";

  if (Math.abs(value) < 1 && value !== 0) {
    return value.toFixed(3).replace(/^0/, "");
  }

  return value.toFixed(digits);
}

function parseStatSummary(summary: string): Record<string, number> {
  const stats: Record<string, number> = {};
  const regex = /([A-Z]{1,4})\s*[:=]?\s*(-?(?:\d+\.?\d*|\.\d+))/g;
  let match = regex.exec(summary);

  while (match) {
    const key = match[1];
    const raw = match[2];

    if (key && raw) {
      const parsed = Number(raw);

      if (Number.isFinite(parsed)) {
        stats[key.toUpperCase()] = parsed;
      }
    }

    match = regex.exec(summary);
  }

  return stats;
}

function getNestedStat(player: Player, key: string, statBasis: StatBasis): number | null {
  const data = player as unknown as {
    stats?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
    projection?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
    projections?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
    stats3yr?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
  };

  const hittingKey = HITTER_STAT_KEYS.includes(key);
  const pitchingKey = PITCHER_STAT_KEYS.includes(key);
  const side = hittingKey ? "batting" : pitchingKey ? "pitching" : isPitcher(player) ? "pitching" : "batting";

  const source =
    statBasis === "projections"
      ? data.projection?.[side] ?? data.projections?.[side]
      : statBasis === "3-year-avg"
        ? data.stats3yr?.[side] ??
          data.stats?.[side] ??
          data.projection?.[side] ??
          data.projections?.[side]
        : data.stats?.[side] ?? data.projection?.[side] ?? data.projections?.[side];

  if (!source) return null;

  const aliases: Record<string, string[]> = {
    R: ["R", "r", "runs"],
    HR: ["HR", "hr", "homeRuns"],
    RBI: ["RBI", "rbi"],
    SB: ["SB", "sb", "stolenBases"],
    AVG: ["AVG", "avg"],
    W: ["W", "w", "wins"],
    K: ["K", "k", "so", "strikeouts"],
    ERA: ["ERA", "era"],
    WHIP: ["WHIP", "whip"],
    SV: ["SV", "sv", "saves"],
  };

  const keys = aliases[key] ?? [key];

  for (const candidate of keys) {
    const value = finiteNumber(source[candidate]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getStatValue(
  player: Player,
  key: string,
  statBasis: StatBasis,
  statSummary: string,
): number | null {
  const nested = getNestedStat(player, key, statBasis);

  if (nested !== null) {
    return nested;
  }

  const parsed = parseStatSummary(statSummary);
  return parsed[key] ?? null;
}

function statKeysForPlayer(player: Player, statViewFilter: StatViewFilter): string[] {
  if (statViewFilter === "hitting") {
    return HITTER_STAT_KEYS;
  }

  if (statViewFilter === "pitching") {
    return PITCHER_STAT_KEYS;
  }

  if (hasHittingProfile(player)) {
    return HITTER_STAT_KEYS;
  }

  return isPitcher(player) ? PITCHER_STAT_KEYS : HITTER_STAT_KEYS;
}

function statSortKey(sortBy: ResearchSort, pitcher: boolean): string | null {
  if (sortBy === "r_w") return pitcher ? "W" : "R";
  if (sortBy === "hr_k") return pitcher ? "K" : "HR";
  if (sortBy === "rbi_era") return pitcher ? "ERA" : "RBI";
  if (sortBy === "sb_whip") return pitcher ? "WHIP" : "SB";
  if (sortBy === "avg_sv") return pitcher ? "SV" : "AVG";
  return null;
}

function sortMissingLast(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  const aMissing = a === null;
  const bMissing = b === null;

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (direction === "asc") {
    return a! - b!;
  }

  return b! - a!;
}

function comparePlayers(
  a: Player,
  b: Player,
  rowA: ValuationResult | undefined,
  rowB: ValuationResult | undefined,
  sortBy: ResearchSort,
  direction: SortDirection,
  statBasis: StatBasis,
  showEngineValues: boolean,
): number {
  if (sortBy === "name") {
    const result = a.name.localeCompare(b.name);
    return direction === "asc" ? result : -result;
  }

  if (sortBy === "auction_value") {
    return sortMissingLast(
      getAuctionValue(a, rowA),
      getAuctionValue(b, rowB),
      direction,
    );
  }

  if (sortBy === "auction_rank") {
    return sortMissingLast(
      getAuctionRank(a, rowA),
      getAuctionRank(b, rowB),
      direction,
    );
  }

  if (sortBy === "market_adp") {
    return sortMissingLast(
      getMarketAdp(a, rowA),
      getMarketAdp(b, rowB),
      direction,
    );
  }

  if (sortBy === "tier") {
    return sortMissingLast(
      getDisplayTier(a, rowA, showEngineValues),
      getDisplayTier(b, rowB, showEngineValues),
      direction,
    );
  }

  const keyA = statSortKey(sortBy, isPitcher(a));
  const keyB = statSortKey(sortBy, isPitcher(b));
  const summaryA = formatResearchStatSummaryLine(a, statBasis) ?? "";
  const summaryB = formatResearchStatSummaryLine(b, statBasis) ?? "";
  const valueA = keyA ? getStatValue(a, keyA, statBasis, summaryA) : null;
  const valueB = keyB ? getStatValue(b, keyB, statBasis, summaryB) : null;

  return sortMissingLast(valueA, valueB, direction);
}

function getPlayerImageUrl(player: Player): string | null {
  const record = player as unknown as Record<string, unknown>;

  const directImage =
    record.headshotUrl ??
    record.imageUrl ??
    record.photoUrl ??
    record.playerImageUrl ??
    record.headshot;

  if (typeof directImage === "string" && directImage.trim()) {
    return directImage;
  }

  const mlbId =
    finiteNumber(record.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId);

  if (mlbId === null) {
    return null;
  }

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:best/v1/people/${Math.round(
    mlbId,
  )}/headshot/67/current`;
}

function tagMetricValue(player: Player, tag: TagFilter, statBasis: StatBasis): number | null {
  const summary = formatResearchStatSummaryLine(player, statBasis) ?? "";

  if (tag === "HR+") return getStatValue(player, "HR", statBasis, summary);
  if (tag === "SB+") return getStatValue(player, "SB", statBasis, summary);
  if (tag === "AVG+") return getStatValue(player, "AVG", statBasis, summary);
  if (tag === "R+") return getStatValue(player, "R", statBasis, summary);
  if (tag === "RBI+") return getStatValue(player, "RBI", statBasis, summary);
  if (tag === "K+") return getStatValue(player, "K", statBasis, summary);
  if (tag === "W+") return getStatValue(player, "W", statBasis, summary);
  if (tag === "SV+") return getStatValue(player, "SV", statBasis, summary);

  return null;
}

function playerMatchesTag(player: Player, tag: TagFilter, statBasis: StatBasis): boolean {
  const value = tagMetricValue(player, tag, statBasis);

  if (value === null) return false;

  if (tag === "HR+") return value >= 30;
  if (tag === "SB+") return value >= 20;
  if (tag === "AVG+") return value >= 0.28;
  if (tag === "R+") return value >= 90;
  if (tag === "RBI+") return value >= 90;
  if (tag === "K+") return value >= 150;
  if (tag === "W+") return value >= 10;
  if (tag === "SV+") return value >= 20;

  return false;
}

function getPlayerTags(player: Player, statBasis: StatBasis): TagFilter[] {
  return TAG_OPTIONS.filter((tag) => playerMatchesTag(player, tag, statBasis));
}


function FilterRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: 8 }}
      contentContainerStyle={{
        alignItems: "center",
        paddingVertical: 2,
        paddingRight: 18,
      }}
    >
      {children}
    </ScrollView>
  );
}

function FilterPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? "#a855f7" : "#4c3575",
        backgroundColor: selected ? "#8b5cf6" : "#1b1428",
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: "#f9fafb",
          fontSize: 12,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ControlButton({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 54,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? "#a855f7" : "#4c3575",
        backgroundColor: active ? "#281a3f" : "#151021",
        paddingHorizontal: 10,
        paddingVertical: 8,
        justifyContent: "center",
        marginRight: 8,
      }}
    >
      <Text style={{ color: "#a1a1aa", fontSize: 10, fontWeight: "900" }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: "#f9fafb",
          fontSize: 13,
          fontWeight: "900",
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function MetricCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        width: "50%",
        paddingRight: 8,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: "#a1a1aa", fontSize: 11, fontWeight: "800" }}>
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? "#facc15" : "#f9fafb",
          fontSize: 15,
          fontWeight: "900",
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}


function TierPill({ tier }: { tier: number }) {
  const palette = tierColor(tier);

  return (
    <View
      style={{
        alignSelf: "flex-start",
        minWidth: 28,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.borderColor,
        backgroundColor: palette.backgroundColor,
        alignItems: "center",
      }}
    >
      <Text style={{ color: palette.color, fontSize: 13, fontWeight: "900" }}>
        {Math.round(tier)}
      </Text>
    </View>
  );
}

function StarIconButton({
  starred,
  onPress,
}: {
  starred: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={starred ? "Remove from Starred" : "Add to Starred"}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: starred ? "#facc15" : "#4c3575",
        backgroundColor: starred ? "#3a2c13" : "#151021",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: starred ? "#facc15" : "#8b7aa8",
          fontSize: 24,
          fontWeight: "900",
          lineHeight: 28,
        }}
      >
        {starred ? "★" : "☆"}
      </Text>
    </TouchableOpacity>
  );
}


function StatGrid({
  player,
  statBasis,
  statSummary,
  statViewFilter,
}: {
  player: Player;
  statBasis: StatBasis;
  statSummary: string;
  statViewFilter: StatViewFilter;
}) {
  const keys = statKeysForPlayer(player, statViewFilter);

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 8,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: "#33294a",
      }}
    >
      {keys.map((key) => {
        const value = getStatValue(player, key, statBasis, statSummary);
        const digits = key === "AVG" ? 3 : key === "ERA" || key === "WHIP" ? 2 : 0;

        return (
          <MetricCell
            key={key}
            label={key}
            value={formatNumber(value, digits)}
          />
        );
      })}
    </View>
  );
}

function PlayerResearchCard({
  player,
  engineRow,
  watched,
  custom,
  rankNumber,
  statBasis,
  statViewFilter,
  note,
  onChangeNote,
  onOpen,
  onToggleWatchlist,
  showEngineValues,
  onEditCustom,
  onRemoveCustom,
}: {
  player: Player;
  engineRow?: ValuationResult;
  watched: boolean;
  custom: boolean;
  rankNumber?: number;
  statBasis: StatBasis;
  statViewFilter: StatViewFilter;
  note: string;
  onChangeNote: (note: string) => void;
  showEngineValues: boolean;
  onOpen: () => void;
  onToggleWatchlist: () => void;
  onEditCustom: () => void;
  onRemoveCustom: () => void;
}) {
  const displayValue = getAuctionValue(player, engineRow);
  const displayTier = getDisplayTier(player, engineRow, showEngineValues);
  const auctionRank = getAuctionRank(player, engineRow);
  const modelRank = getModelRank(player, engineRow);
  const marketAdp = getMarketAdp(player, engineRow);
  const statSummary = formatResearchStatSummaryLine(player, statBasis) ?? "";
  const injury = player.injuryStatus?.trim();
  const imageUrl = getPlayerImageUrl(player);
  const cardTags = getPlayerTags(player, statBasis);

  return (
    <AppCard backgroundColor="#151021" borderColor="#31224f">
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity
          onPress={onOpen}
          style={{
            flex: 1,
            marginRight: 10,
            flexDirection: "row",
            alignItems: "center",
          }}
          activeOpacity={0.85}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                marginRight: 12,
                backgroundColor: "#272034",
                borderWidth: 1,
                borderColor: "#4c3575",
              }}
            />
          ) : (
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                marginRight: 12,
                backgroundColor: "#272034",
                borderWidth: 1,
                borderColor: "#4c3575",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#c4b5fd", fontWeight: "900" }}>
                {player.name.slice(0, 1)}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: "#f9fafb",
                fontSize: 17,
                fontWeight: "900",
                marginBottom: 3,
              }}
            >
              {rankNumber ? `#${rankNumber} ` : ""}{player.name}
              {custom ? " • Custom" : ""}
            </Text>

            <Text style={{ color: "#c4b5fd", fontWeight: "800" }}>
              Team: {player.team || "FA"} • Pos: {displayPosition(player)}
            </Text>

            {cardTags.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                {cardTags.slice(0, 3).map((tag) => (
                  <Text
                    key={tag}
                    style={{
                      color: "#ddd6fe",
                      backgroundColor: "#2c1a47",
                      borderColor: "#5b3a89",
                      borderWidth: 1,
                      borderRadius: 999,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      marginRight: 5,
                      marginBottom: 4,
                      fontSize: 10,
                      fontWeight: "900",
                      overflow: "hidden",
                    }}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={{ alignItems: "flex-end" }}>
          <StarIconButton starred={watched} onPress={onToggleWatchlist} />

          {custom ? (
            <>
              <AppChip
                label="Edit"
                tone="info"
                onPress={onEditCustom}
                style={{ marginTop: 8, marginBottom: 8 }}
              />

              <AppChip
                label="Remove"
                tone="danger"
                onPress={onRemoveCustom}
              />
            </>
          ) : null}
        </View>
      </View>

      <View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
          <MetricCell
            label="Team"
            value={player.team || "FA"}
          />
          <MetricCell
            label="Pos"
            value={displayPosition(player)}
          />
          <MetricCell
            label="Market ADP"
            value={formatNumber(marketAdp, 2)}
          />
          <MetricCell
            label="Auction Rank"
            value={auctionRank === null ? "—" : `#${Math.round(auctionRank)}`}
          />
          <MetricCell
            label="Auction Value"
            value={formatMoney(displayValue)}
            highlight
          />
        </View>

        {showEngineValues && engineRow ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              borderTopWidth: 1,
              borderTopColor: "#33294a",
              paddingTop: 10,
              marginTop: 2,
            }}
          >
            <View style={{ width: "50%", paddingRight: 8, marginBottom: 10 }}>
              <Text style={{ color: "#a1a1aa", fontSize: 11, fontWeight: "800" }}>
                Auction Tier
              </Text>
              <View style={{ marginTop: 4 }}>
                <TierPill tier={displayTier} />
              </View>
            </View>
            <MetricCell
              label="Model Rank"
              value={modelRank === null ? "—" : `#${Math.round(modelRank)}`}
            />
          </View>
        ) : null}

        {engineRow?.indicator ? (
          <Text style={{ color: "#c4b5fd", fontWeight: "800", marginTop: 2 }}>
            {engineRow.indicator}
          </Text>
        ) : null}

        {injury ? (
          <Text style={{ color: "#fca5a5", fontWeight: "800", marginTop: 6 }}>
            Injury: {injury}
          </Text>
        ) : null}

        <StatGrid
          player={player}
          statBasis={statBasis}
          statSummary={statSummary}
          statViewFilter={statViewFilter}
        />

        {statSummary ? (
          <Text numberOfLines={2} style={{ color: "#a1a1aa", marginTop: 4 }}>
            {statSummary}
          </Text>
        ) : null}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#33294a",
            marginTop: 10,
            paddingTop: 10,
          }}
        >
          <Text style={{ color: "#a1a1aa", fontSize: 11, fontWeight: "900", marginBottom: 6 }}>
            Notes
          </Text>
          <TextInput
            value={note}
            onChangeText={onChangeNote}
            placeholder="Add note..."
            placeholderTextColor="#6b5f80"
            multiline
            style={{
              minHeight: 42,
              borderWidth: 1,
              borderColor: "#3f335c",
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: "#f9fafb",
              backgroundColor: "#0b0712",
              textAlignVertical: "top",
            }}
          />
          {note.trim().length > 0 ? (
            <TouchableOpacity
              onPress={() => onChangeNote("")}
              style={{ alignSelf: "flex-start", marginTop: 6 }}
            >
              <Text style={{ color: "#c4b5fd", fontSize: 12, fontWeight: "900" }}>
                Clear note
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {!!player.outlook && (
          <Text numberOfLines={2} style={{ color: "#a1a1aa", marginTop: 6 }}>
            {player.outlook}
          </Text>
        )}
      </View>
    </AppCard>
  );
}

export default function ResearchScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();
  const { setSelectedPlayer } = useSelectedPlayer();
  const {
    getWatchlistForLeague,
    loadWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
  } = useWatchlist();
  const {
    customPlayers,
    addCustomPlayer,
    updateCustomPlayer,
    removeCustomPlayer,
    isCustomPlayer,
  } = useCustomPlayers();
  const { getNote, loadNotes, setNote } = usePlayerNotes();

  const league = allLeagues.find((item) => item.id === leagueId);
  const watchlist = getWatchlistForLeague(leagueId);

  const [rosterForValuation, setRosterForValuation] = useState<RosterEntry[]>([]);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState<Player | null>(null);

  const draftedIds = useMemo(() => {
    return new Set(rosterForValuation.map((entry) => entry.externalPlayerId));
  }, [rosterForValuation]);

  useEffect(() => {
    if (!token || !leagueId) {
      setRosterForValuation([]);
      return;
    }

    void getRoster(leagueId, token)
      .then(setRosterForValuation)
      .catch(() => setRosterForValuation([]));
  }, [token, leagueId]);

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.teams,
      league?.budget,
      league ? JSON.stringify(league.rosterSlots) : "",
      league ? JSON.stringify(league.scoringCategories) : "",
      league?.memberIds?.join(","),
      league?.posEligibilityThreshold,
      league?.playerPool,
      league?.teamNames?.join("\u0001"),
    ],
  );

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterForValuation),
    [rosterForValuation],
  );

  const customPlayerIdsKey = useMemo(
    () => customPlayers.map((p) => p.id).sort().join("\u0001"),
    [customPlayers],
  );

  const [selectedView, setSelectedView] =
    useState<ResearchView>("player-database");

  const [players, setPlayers] = useState<Player[]>(
    () =>
      getPlayersCached(
        "adp",
        league?.posEligibilityThreshold,
        league?.playerPool,
      ) ?? [],
  );
  const [playersError, setPlayersError] = useState("");
  const [loadingPlayers, setLoadingPlayers] = useState(
    () =>
      getPlayersCached(
        "adp",
        league?.posEligibilityThreshold,
        league?.playerPool,
      ) === null,
  );

  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationResult>
  >(new Map());

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] =
    useState<PositionFilter>("ALL");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>("all");
  const [injuryFilter, setInjuryFilter] =
    useState<InjuryFilter>("all");
  const [statViewFilter, setStatViewFilter] =
    useState<StatViewFilter>("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [statBasis, setStatBasis] = useState<StatBasis>("last-year");
  const [sortBy, setSortBy] = useState<ResearchSort>("auction_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activePanel, setActivePanel] = useState<ControlPanel>(null);
  const [selectedTags, setSelectedTags] = useState<TagFilter[]>([]);
  const [showEngineValues, setShowEngineValues] = useState(false);

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editingCustomPlayerId, setEditingCustomPlayerId] = useState<string | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerTeam, setNewPlayerTeam] = useState("");
  const [newPlayerPosition, setNewPlayerPosition] = useState("");
  const [newPlayerAdp, setNewPlayerAdp] = useState("999");
  const [newPlayerValue, setNewPlayerValue] = useState("1");
  const [newPlayerTier, setNewPlayerTier] = useState("5");

  const [selectedDepthTeamId, setSelectedDepthTeamId] = useState(147);
  const [depthChartData, setDepthChartData] = useState<DepthChartResponse | null>(
    () => getDepthChartCached(147),
  );
  const [isLoadingDepthChart, setIsLoadingDepthChart] = useState(
    () => getDepthChartCached(147) === null,
  );
  const [depthChartError, setDepthChartError] = useState("");

  const availablePositionFilters = useMemo(
    () => positionFiltersForStatView(statViewFilter),
    [statViewFilter],
  );

  useEffect(() => {
    if (!availablePositionFilters.includes(positionFilter)) {
      setPositionFilter(availablePositionFilters[0] ?? "ALL");
    }
  }, [availablePositionFilters, positionFilter]);

  useEffect(() => {
    void loadWatchlist(leagueId);
  }, [leagueId, loadWatchlist]);

  useEffect(() => {
    void loadNotes(leagueId);
  }, [leagueId, loadNotes]);

  useEffect(() => {
    async function loadBasis() {
      try {
        const stored = await AsyncStorage.getItem(
          RESEARCH_STAT_BASIS_STORAGE_KEY_MOBILE,
        );
        setStatBasis(parseStatBasis(stored, "last-year"));
      } catch {
        // ignore
      }
    }

    void loadBasis();
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(
      RESEARCH_STAT_BASIS_STORAGE_KEY_MOBILE,
      statBasis,
    );
  }, [statBasis]);

  useEffect(() => {
    if (selectedView !== "player-database" && selectedView !== "tiers") return;

    async function loadPlayers() {
      const cached = getPlayersCached(
        "adp",
        league?.posEligibilityThreshold,
        league?.playerPool,
      );

      if (!cached) {
        setLoadingPlayers(true);
      }

      setPlayersError("");

      try {
        const data = await getPlayers(
          "adp",
          league?.posEligibilityThreshold,
          league?.playerPool,
        );
        setPlayers(data);
      } catch (err) {
        setPlayersError(
          err instanceof Error ? err.message : "Failed to load players",
        );
      } finally {
        setLoadingPlayers(false);
      }
    }

    void loadPlayers();
  }, [selectedView, league?.playerPool, league?.posEligibilityThreshold]);

  useEffect(() => {
    if (!token || !leagueId || players.length === 0) {
      setValuationsByPlayerId(new Map());
      return;
    }

    let cancelled = false;

    void getValuation(leagueId, token, "team_1", {
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationKey,
    })
      .then((response) => {
        if (cancelled) return;

        const customPlayerIdSet = new Set(
          customPlayerIdsKey.length > 0 ? customPlayerIdsKey.split("\u0001") : [],
        );
        const merged = new Map<string, ValuationResult>();

        for (const row of response.valuations) {
          if (customPlayerIdSet.has(row.player_id)) continue;

          merged.set(row.player_id, row);

          const matchedPlayer = players.find((player) =>
            playerMatchesValuationRow(player, row),
          );

          if (matchedPlayer) {
            merged.set(matchedPlayer.id, row);
          }
        }

        setValuationsByPlayerId(merged);

        console.log("VALUATION SAMPLE", response.valuations.slice(0, 3));
        console.log("PLAYER SAMPLE", players.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) {
          setValuationsByPlayerId(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    leagueId,
    players,
    customPlayerIdsKey,
    leagueValuationKey,
    rosterValuationKey,
  ]);

  const loadDepthChart = useCallback(
    async (teamId: number, forceRefresh = false) => {
      const cached = getDepthChartCached(teamId);

      if (!cached || forceRefresh) {
        setIsLoadingDepthChart(true);
      }

      setDepthChartError("");

      try {
        const depth = await getTeamDepthChart(teamId, undefined, forceRefresh);
        setDepthChartData(depth);
      } catch (err) {
        setDepthChartError(
          err instanceof Error ? err.message : "Failed to load depth chart",
        );
      } finally {
        setIsLoadingDepthChart(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedView !== "depth-charts") return;
    void loadDepthChart(selectedDepthTeamId);
  }, [selectedView, selectedDepthTeamId, loadDepthChart]);

  const allPlayers = useMemo(
    () => [...customPlayers, ...players],
    [customPlayers, players],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allPlayers.filter((player) => {
      const nameMatch = player.name.toLowerCase().includes(q);
      const teamMatch = player.team.toLowerCase().includes(q);
      const positionText = [player.position, ...(player.positions ?? [])]
        .join("/")
        .toLowerCase();
      const posTextMatch = positionText.includes(q);
      const posMatch = positionMatches(player, positionFilter);
      const watched = isInWatchlist(leagueId, player.id);
      const drafted = draftedIds.has(player.id);
      const injured = playerHasInjury(player);
      const pitcher = isPitcher(player);

      if (q && !nameMatch && !teamMatch && !posTextMatch) return false;
      if (!posMatch) return false;

      if (starredOnly && !watched) return false;

      if (availabilityFilter === "available" && drafted) return false;
      if (availabilityFilter === "drafted" && !drafted) return false;

      if (injuryFilter === "healthy" && injured) return false;
      if (injuryFilter === "injured" && !injured) return false;

      if (statViewFilter === "hitting" && !hasHittingProfile(player)) return false;
      if (statViewFilter === "pitching" && !pitcher) return false;

      if (
        selectedTags.length > 0 &&
        !selectedTags.every((tag) => playerMatchesTag(player, tag, statBasis))
      ) {
        return false;
      }

      return true;
    });
  }, [
    allPlayers,
    search,
    positionFilter,
    starredOnly,
    availabilityFilter,
    injuryFilter,
    statViewFilter,
    selectedTags,
    statBasis,
    draftedIds,
    isInWatchlist,
    leagueId,
  ]);

  const sortedFilteredPlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) =>
      comparePlayers(
        a,
        b,
        valuationsByPlayerId.get(a.id),
        valuationsByPlayerId.get(b.id),
        sortBy,
        sortDirection,
        statBasis,
        showEngineValues,
      ),
    );
  }, [
    filteredPlayers,
    valuationsByPlayerId,
    sortBy,
    sortDirection,
    statBasis,
    showEngineValues,
  ]);

  const tierBuckets = useMemo(() => {
    const grouped = new Map<number, Player[]>();

    for (const player of filteredPlayers) {
      const engineRow = valuationsByPlayerId.get(player.id);
      const tier = getDisplayTier(player, engineRow, showEngineValues);

      if (!grouped.has(tier)) {
        grouped.set(tier, []);
      }

      grouped.get(tier)!.push(player);
    }

    const sortedTiers = Array.from(grouped.keys()).sort((a, b) => a - b);

    return sortedTiers.map((tier) => ({
      tier,
      players: (grouped.get(tier) ?? []).sort((a, b) =>
       comparePlayers(
          a,
          b,
          valuationsByPlayerId.get(a.id),
          valuationsByPlayerId.get(b.id),
          sortBy,
          sortDirection,
          statBasis,
          showEngineValues,
        )
      ),
    }));
  }, [
    filteredPlayers,
    valuationsByPlayerId,
    sortBy,
    sortDirection,
    statBasis,
    showEngineValues,
  ]);

  const depthTotalSlots = DEPTH_POSITIONS.length * 3;

  const depthAssignedCount = useMemo(() => {
    if (!depthChartData) return 0;

    return DEPTH_POSITIONS.reduce(
      (total, position) => total + (depthChartData.positions[position]?.length ?? 0),
      0,
    );
  }, [depthChartData]);

  function resetCustomPlayerForm() {
    setEditingCustomPlayerId(null);
    setNewPlayerName("");
    setNewPlayerTeam("");
    setNewPlayerPosition("");
    setNewPlayerAdp("999");
    setNewPlayerValue("1");
    setNewPlayerTier("5");
    setShowAddPlayer(false);
  }

  function startEditingCustomPlayer(player: Player) {
    setEditingCustomPlayerId(player.id);
    setNewPlayerName(player.name);
    setNewPlayerTeam(player.team);
    setNewPlayerPosition(player.position);
    setNewPlayerAdp(String(player.adp ?? 999));
    setNewPlayerValue(String(player.value ?? 1));
    setNewPlayerTier(String(player.tier ?? 5));
    setShowAddPlayer(true);
  }

  function handleOpenPlayer(player: Player) {
    setSelectedModalPlayer(player);
  }

  function handleMoveToCommandCenter(player: Player) {
    setSelectedPlayer(player);
    setSelectedModalPlayer(null);
    navigation.navigate("CommandCenter", { leagueId });
  }

  function handleSortPress(value: ResearchSort) {
    if (sortBy === value) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(value);

    if (
      value === "auction_rank" ||
      value === "market_adp" ||
      value === "tier" ||
      value === "name"
    ) {
      setSortDirection("asc");
    } else {
      setSortDirection("desc");
    }
  }

  function togglePanel(panel: Exclude<ControlPanel, null>) {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  function toggleTag(tag: TagFilter) {
    setSelectedTags((current) => {
      if (current.includes(tag)) {
        return current.filter((item) => item !== tag);
      }

      return [...current, tag];
    });
  }

  async function resolveDepthPlayer(
    slot: DepthChartPlayerRow,
  ): Promise<Player | null> {
    const existing =
      allPlayers.find(
        (player) =>
          player.mlbId === slot.playerId || player.id === String(slot.playerId),
      ) ?? null;

    if (existing) {
      return existing;
    }

    const refreshed = await getPlayers(
      "adp",
      league?.posEligibilityThreshold,
      league?.playerPool,
    );
    setPlayers(refreshed);

    return (
      refreshed.find(
        (player) =>
          player.mlbId === slot.playerId || player.id === String(slot.playerId),
      ) ?? null
    );
  }

  async function handleDepthPlayerPress(slot: DepthChartPlayerRow) {
    try {
      const player = await resolveDepthPlayer(slot);

      if (!player) {
        setDepthChartError(
          `Could not open ${slot.playerName}. Player record was not found.`,
        );
        return;
      }

      handleOpenPlayer(player);
    } catch (err) {
      setDepthChartError(
        err instanceof Error ? err.message : "Failed to open player",
      );
    }
  }

  async function handleDepthStarToggle(slot: DepthChartPlayerRow) {
    try {
      const player = await resolveDepthPlayer(slot);

      if (!player) {
        setDepthChartError(
          `Could not save ${slot.playerName}. Player record was not found.`,
        );
        return;
      }

      if (isInWatchlist(leagueId, player.id)) {
        await removeFromWatchlist(leagueId, player.id);
      } else {
        await addToWatchlist(leagueId, player);
      }
    } catch (err) {
      setDepthChartError(
        err instanceof Error ? err.message : "Failed to update watchlist",
      );
    }
  }

  async function handleToggleWatchlist(player: Player) {
    try {
      if (isInWatchlist(leagueId, player.id)) {
        await removeFromWatchlist(leagueId, player.id);
      } else {
        await addToWatchlist(leagueId, player);
      }
    } catch (err) {
      Alert.alert(
        "Starred error",
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
  }

  async function handleSaveCustomPlayer() {
    if (!newPlayerName.trim() || !newPlayerTeam.trim() || !newPlayerPosition.trim()) {
      Alert.alert("Missing fields", "Please enter name, team, and position.");
      return;
    }

    const adp = Number(newPlayerAdp);
    const value = Number(newPlayerValue);
    const tier = Number(newPlayerTier);

    if (!Number.isFinite(adp) || adp < 0) {
      Alert.alert("Invalid ADP", "ADP must be a non-negative number.");
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      Alert.alert("Invalid value", "Value must be a non-negative number.");
      return;
    }

    if (!Number.isFinite(tier) || tier < 1) {
      Alert.alert("Invalid tier", "Tier must be at least 1.");
      return;
    }

    try {
      if (editingCustomPlayerId) {
        await updateCustomPlayer(editingCustomPlayerId, {
          name: newPlayerName,
          team: newPlayerTeam,
          position: newPlayerPosition,
          adp,
          value,
          tier,
        });
      } else {
        await addCustomPlayer({
          name: newPlayerName,
          team: newPlayerTeam,
          position: newPlayerPosition,
          adp,
          value,
          tier,
        });
      }

      resetCustomPlayerForm();
    } catch (err) {
      Alert.alert(
        editingCustomPlayerId ? "Could not update player" : "Could not add player",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  }

  const selectedEngineRow = selectedModalPlayer
    ? valuationsByPlayerId.get(selectedModalPlayer.id)
    : undefined;

  const selectedDisplayValue = selectedModalPlayer
    ? getAuctionValue(selectedModalPlayer, selectedEngineRow)
    : 0;

  const selectedDisplayTier = selectedModalPlayer
    ? getDisplayTier(selectedModalPlayer, selectedEngineRow, showEngineValues)
    : 0;

  const selectedStatSummary = selectedModalPlayer
    ? formatResearchStatSummaryLine(selectedModalPlayer, statBasis) ?? ""
    : "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0712" }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 110,
        }}
      >
        <View style={{ flexDirection: "row", marginBottom: 14 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <AppChip
              label="Players"
              selected={selectedView === "player-database"}
              fullWidth
              onPress={() => setSelectedView("player-database")}
            />
          </View>

          <View style={{ flex: 1, marginRight: 8 }}>
            <AppChip
              label="Tiers"
              selected={selectedView === "tiers"}
              fullWidth
              onPress={() => setSelectedView("tiers")}
            />
          </View>

          <View style={{ flex: 1 }}>
            <AppChip
              label="Depth Charts"
              selected={selectedView === "depth-charts"}
              fullWidth
              onPress={() => setSelectedView("depth-charts")}
            />
          </View>
        </View>

        {selectedView === "player-database" || selectedView === "tiers" ? (
          <>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search players by name..."
              placeholderTextColor="#71717a"
              style={{
                borderWidth: 1,
                borderColor: "#3f335c",
                marginBottom: 10,
                padding: 12,
                borderRadius: 12,
                color: "#f9fafb",
                backgroundColor: "#151021",
              }}
            />

            <View style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                <ControlButton
                  label="FILTER"
                  value={`${availabilityFilter === "all" ? "All" : availabilityFilter} • ${
                    statViewFilter === "all" ? "All" : statViewFilter
                  }`}
                  active={activePanel === "filters"}
                  onPress={() => togglePanel("filters")}
                />
                <ControlButton
                  label="SORT"
                  value={`${SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? "Auction $"} ${
                    sortDirection === "asc" ? "↑" : "↓"
                  }`}
                  active={activePanel === "sort"}
                  onPress={() => togglePanel("sort")}
                />
              </View>

              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                <ControlButton
                  label="STARRED"
                  value={starredOnly ? "Only Starred" : "All Players"}
                  active={starredOnly}
                  onPress={() => setStarredOnly((value) => !value)}
                />
                <ControlButton
                  label="TAGS"
                  value={selectedTags.length === 0 ? "Any" : selectedTags.join(", ")}
                  active={activePanel === "tags"}
                  onPress={() => togglePanel("tags")}
                />
              </View>

              <View style={{ flexDirection: "row" }}>
                <ControlButton
                  label="MODEL RANK & TIERS"
                  value={showEngineValues ? "On" : "Off"}
                  active={showEngineValues}
                  onPress={() => setShowEngineValues((value) => !value)}
                />
              </View>
            </View>

            <View style={{ marginBottom: 2 }}>
              <Text style={{ color: "#a1a1aa", fontSize: 11, fontWeight: "900", marginBottom: 6 }}>
                STATS
              </Text>
              <FilterRow>
                <FilterPill
                  label="PROJ"
                  selected={statBasis === "projections"}
                  onPress={() => setStatBasis("projections")}
                />
                <FilterPill
                  label="1Y"
                  selected={statBasis === "last-year"}
                  onPress={() => setStatBasis("last-year")}
                />
                <FilterPill
                  label="3Y"
                  selected={statBasis === "3-year-avg"}
                  onPress={() => setStatBasis("3-year-avg")}
                />
              </FilterRow>
            </View>

            {activePanel === "filters" ? (
              <AppCard backgroundColor="#151021" borderColor="#31224f">
                <Text style={{ color: "#f9fafb", fontWeight: "900", marginBottom: 8 }}>
                  Filters
                </Text>

                <Text style={{ color: "#a1a1aa", fontSize: 12, fontWeight: "900", marginBottom: 6 }}>
                  Availability
                </Text>
                <FilterRow>
                  <FilterPill
                    label="All"
                    selected={availabilityFilter === "all"}
                    onPress={() => setAvailabilityFilter("all")}
                  />
                  <FilterPill
                    label="Available"
                    selected={availabilityFilter === "available"}
                    onPress={() => setAvailabilityFilter("available")}
                  />
                  <FilterPill
                    label="Drafted"
                    selected={availabilityFilter === "drafted"}
                    onPress={() => setAvailabilityFilter("drafted")}
                  />
                </FilterRow>

                <Text style={{ color: "#a1a1aa", fontSize: 12, fontWeight: "900", marginBottom: 6 }}>
                  Hitters/Pitchers
                </Text>
                <FilterRow>
                  <FilterPill
                    label="All"
                    selected={statViewFilter === "all"}
                    onPress={() => setStatViewFilter("all")}
                  />
                  <FilterPill
                    label="Hitters"
                    selected={statViewFilter === "hitting"}
                    onPress={() => setStatViewFilter("hitting")}
                  />
                  <FilterPill
                    label="Pitchers"
                    selected={statViewFilter === "pitching"}
                    onPress={() => setStatViewFilter("pitching")}
                  />
                </FilterRow>

                <Text style={{ color: "#a1a1aa", fontSize: 12, fontWeight: "900", marginBottom: 6 }}>
                  Position
                </Text>
                <FilterRow>
                  {availablePositionFilters.map((filter) => (
                    <FilterPill
                      key={filter}
                      label={filter}
                      selected={positionFilter === filter}
                      onPress={() => setPositionFilter(filter)}
                    />
                  ))}
                </FilterRow>

                <Text style={{ color: "#a1a1aa", fontSize: 12, fontWeight: "900", marginBottom: 6 }}>
                  Health
                </Text>
                <FilterRow>
                  <FilterPill
                    label="All"
                    selected={injuryFilter === "all"}
                    onPress={() => setInjuryFilter("all")}
                  />
                  <FilterPill
                    label="Healthy"
                    selected={injuryFilter === "healthy"}
                    onPress={() => setInjuryFilter("healthy")}
                  />
                  <FilterPill
                    label="Injured"
                    selected={injuryFilter === "injured"}
                    onPress={() => setInjuryFilter("injured")}
                  />
                </FilterRow>
              </AppCard>
            ) : null}

            {activePanel === "sort" ? (
              <AppCard backgroundColor="#151021" borderColor="#31224f">
                <Text style={{ color: "#f9fafb", fontWeight: "900", marginBottom: 8 }}>
                  Sort By {sortDirection === "asc" ? "↑" : "↓"}
                </Text>
                <FilterRow>
                  {SORT_OPTIONS.map((option) => (
                    <FilterPill
                      key={option.value}
                      label={
                        sortBy === option.value
                          ? `${option.label} ${sortDirection === "asc" ? "↑" : "↓"}`
                          : option.label
                      }
                      selected={sortBy === option.value}
                      onPress={() => handleSortPress(option.value)}
                    />
                  ))}
                </FilterRow>
              </AppCard>
            ) : null}

            {activePanel === "tags" ? (
              <AppCard backgroundColor="#151021" borderColor="#31224f">
                <Text style={{ color: "#f9fafb", fontWeight: "900", marginBottom: 8 }}>
                  Tags
                </Text>
                <Text style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 8 }}>
                  Tags are based on the selected stat view: PROJ, 1Y, or 3Y.
                </Text>
                <FilterRow>
                  {TAG_OPTIONS.map((tag) => (
                    <FilterPill
                      key={tag}
                      label={tag}
                      selected={selectedTags.includes(tag)}
                      onPress={() => toggleTag(tag)}
                    />
                  ))}
                </FilterRow>
              </AppCard>
            ) : null}

            {selectedView === "player-database" ? (
              <View style={{ marginBottom: 12, flexDirection: "row" }}>
                <AppChip
                  label={showAddPlayer ? "Close Add Player" : "Add Player"}
                  selected
                  onPress={() => {
                    if (showAddPlayer) {
                      resetCustomPlayerForm();
                    } else {
                      setShowAddPlayer(true);
                    }
                  }}
                />
              </View>
            ) : null}

            {showAddPlayer && selectedView === "player-database" ? (
              <AppCard backgroundColor="#151021" borderColor="#31224f">
                <Text style={{ color: "#f9fafb", fontWeight: "800", marginBottom: 10 }}>
                  {editingCustomPlayerId ? "Edit Custom Player" : "Add Custom Player"}
                </Text>

                {[
                  ["Name", newPlayerName, setNewPlayerName],
                  ["Team", newPlayerTeam, setNewPlayerTeam],
                  ["Position e.g. OF or SP", newPlayerPosition, setNewPlayerPosition],
                  ["ADP", newPlayerAdp, setNewPlayerAdp],
                  ["Value", newPlayerValue, setNewPlayerValue],
                  ["Tier", newPlayerTier, setNewPlayerTier],
                ].map(([placeholder, value, setter]) => (
                  <TextInput
                    key={String(placeholder)}
                    value={String(value)}
                    onChangeText={setter as (value: string) => void}
                    placeholder={String(placeholder)}
                    placeholderTextColor="#71717a"
                    autoCapitalize={
                      placeholder === "Team" || placeholder === "Position e.g. OF or SP"
                        ? "characters"
                        : "none"
                    }
                    keyboardType={
                      placeholder === "ADP" || placeholder === "Value" || placeholder === "Tier"
                        ? "numeric"
                        : "default"
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: "#3f335c",
                      borderRadius: 8,
                      padding: 10,
                      color: "#f9fafb",
                      backgroundColor: "#0b0712",
                      marginBottom: 8,
                    }}
                  />
                ))}

                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <TouchableOpacity
                    onPress={() => void handleSaveCustomPlayer()}
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: "#7c3aed",
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {editingCustomPlayerId ? "Update Custom Player" : "Save Custom Player"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={resetCustomPlayerForm}
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: "#272034",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: "#f9fafb", fontWeight: "800" }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </AppCard>
            ) : null}

            {playersError ? <ErrorState label={playersError} /> : null}

            {loadingPlayers ? (
              <LoadingState label="Loading players..." />
            ) : selectedView === "player-database" ? (
              <>
                <Text style={{ marginBottom: 12, color: "#a1a1aa", fontWeight: "800" }}>
                  Showing {sortedFilteredPlayers.length} players • Starred {watchlist.length}
                </Text>

                {sortedFilteredPlayers.length === 0 ? (
                  <EmptyState label="No players found." />
                ) : (
                  sortedFilteredPlayers.map((item, index) => {
                    const watched = isInWatchlist(leagueId, item.id);
                    const engineRow = valuationsByPlayerId.get(item.id);
                    const custom = isCustomPlayer(item.id);

                    return (
                      <PlayerResearchCard
                        key={item.id}
                        player={item}
                        engineRow={engineRow}
                        watched={watched}
                        custom={custom}
                        rankNumber={index + 1}
                        statBasis={statBasis}
                        statViewFilter={statViewFilter}
                        note={getNote(leagueId, item.id)}
                        onChangeNote={(note) => setNote(leagueId, item.id, note)}
                        showEngineValues={showEngineValues}
                        onOpen={() => handleOpenPlayer(item)}
                        onToggleWatchlist={() => void handleToggleWatchlist(item)}
                        onEditCustom={() => startEditingCustomPlayer(item)}
                        onRemoveCustom={() => void removeCustomPlayer(item.id)}
                      />
                    );
                  })
                )}
              </>
            ) : (
              <>
                <Text style={{ marginBottom: 12, color: "#a1a1aa", fontWeight: "800" }}>
                  {filteredPlayers.length} filtered players across {tierBuckets.length} tiers
                </Text>

                {tierBuckets.length === 0 ? (
                  <EmptyState label="No tiers found." />
                ) : (
                  tierBuckets.map((bucket) => (
                    <AppCard
                      key={bucket.tier}
                      backgroundColor="#151021"
                      borderColor="#31224f"
                    >
                      <Text
                        style={{
                          color: "#f9fafb",
                          fontSize: 18,
                          fontWeight: "900",
                          marginBottom: 10,
                        }}
                      >
                        Tier {bucket.tier} • {bucket.players.length} players
                      </Text>

                      {bucket.players.slice(0, 15).map((player) => {
                        const engineRow = valuationsByPlayerId.get(player.id);
                        const watched = isInWatchlist(leagueId, player.id);
                        const custom = isCustomPlayer(player.id);

                        return (
                          <PlayerResearchCard
                            key={player.id}
                            player={player}
                            engineRow={engineRow}
                            watched={watched}
                            custom={custom}
                            statBasis={statBasis}
                            statViewFilter={statViewFilter}
                            note={getNote(leagueId, player.id)}
                            onChangeNote={(note) => setNote(leagueId, player.id, note)}
                            showEngineValues={showEngineValues}
                            onOpen={() => handleOpenPlayer(player)}
                            onToggleWatchlist={() => void handleToggleWatchlist(player)}
                            onEditCustom={() => startEditingCustomPlayer(player)}
                            onRemoveCustom={() => void removeCustomPlayer(player.id)}
                          />
                        );
                      })}

                      {bucket.players.length > 15 ? (
                        <Text style={{ color: "#a1a1aa", marginTop: 8 }}>
                          +{bucket.players.length - 15} more players in this tier
                        </Text>
                      ) : null}
                    </AppCard>
                  ))
                )}
              </>
            )}
          </>
        ) : (
          <>
            <FilterRow>
              {MLB_TEAMS.map((team) => (
                <FilterPill
                  key={team.id}
                  label={team.abbr}
                  selected={selectedDepthTeamId === team.id}
                  onPress={() => setSelectedDepthTeamId(team.id)}
                />
              ))}
            </FilterRow>

            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              <AppChip
                label="Refresh"
                selected
                onPress={() => void loadDepthChart(selectedDepthTeamId, true)}
              />
            </View>

            {depthChartError ? <ErrorState label={depthChartError} /> : null}

            {isLoadingDepthChart ? (
              <LoadingState label="Loading depth chart..." />
            ) : !depthChartData ? (
              <EmptyState label="No depth chart data available." />
            ) : (
              <>
                <AppCard backgroundColor="#151021" borderColor="#31224f">
                  <Text style={{ color: "#f9fafb", fontWeight: "900", marginBottom: 6 }}>
                    Team Depth Summary
                  </Text>
                  <Text style={{ color: "#d1d5db" }}>
                    Updated {new Date(depthChartData.generatedAt).toLocaleString()}
                  </Text>
                  <Text style={{ color: "#d1d5db" }}>
                    Roster {depthChartData.rosterCount}/{depthChartData.rosterLimit}
                  </Text>
                  <Text style={{ color: "#d1d5db" }}>
                    Assignments {depthAssignedCount}/{depthTotalSlots}
                  </Text>
                  <Text style={{ color: "#d1d5db" }}>
                    Manual review {depthChartData.manualReview.length}
                  </Text>
                  <Text style={{ color: "#a1a1aa", marginTop: 4 }}>
                    {depthChartData.constraints.note}
                  </Text>
                </AppCard>

                {DEPTH_POSITIONS.map((position) => {
                  const rows = depthChartData.positions[position] ?? [];

                  return (
                    <AppCard
                      key={position}
                      backgroundColor="#151021"
                      borderColor="#31224f"
                    >
                      <Text
                        style={{
                          color: "#f9fafb",
                          fontSize: 18,
                          fontWeight: "900",
                          marginBottom: 10,
                        }}
                      >
                        {position} • {rows.length}/3
                      </Text>

                      {[1, 2, 3].map((rank, index) => {
                        const row = rows.find((item) => item.rank === rank);

                        if (!row) {
                          return (
                            <View
                              key={`${position}-${rank}`}
                              style={{
                                paddingVertical: 10,
                                borderTopWidth: index === 0 ? 0 : 1,
                                borderTopColor: "#33294a",
                              }}
                            >
                              <Text style={{ color: "#f9fafb", fontWeight: "800", marginBottom: 4 }}>
                                #{rank}
                              </Text>
                              <Text style={{ color: "#a1a1aa" }}>No assignment</Text>
                            </View>
                          );
                        }

                        const matchedPlayer =
                          allPlayers.find(
                            (player) =>
                              player.mlbId === row.playerId ||
                              player.id === String(row.playerId),
                          ) ?? null;

                        const isSaved = matchedPlayer
                          ? isInWatchlist(leagueId, matchedPlayer.id)
                          : false;

                        return (
                          <View
                            key={`${position}-${rank}`}
                            style={{
                              paddingVertical: 10,
                              borderTopWidth: index === 0 ? 0 : 1,
                              borderTopColor: "#33294a",
                            }}
                          >
                            <Text style={{ color: "#f9fafb", fontWeight: "800", marginBottom: 4 }}>
                              #{rank}
                            </Text>

                            <TouchableOpacity onPress={() => void handleDepthPlayerPress(row)}>
                              <Text style={{ color: "#f9fafb", fontWeight: "800" }}>
                                {row.playerName}
                              </Text>
                              <Text style={{ color: "#d1d5db", marginTop: 2 }}>
                                {row.primaryPosition} • {row.status}
                              </Text>
                              <Text style={{ color: "#d1d5db" }}>
                                {row.usageStarts} starts • {row.usageAppearances} apps
                              </Text>
                              {row.outOfPosition || row.needsManualReview ? (
                                <Text style={{ color: "#fca5a5", marginTop: 4, fontWeight: "800" }}>
                                  OOF / Manual Review
                                </Text>
                              ) : null}
                            </TouchableOpacity>

                            <View style={{ marginTop: 8 }}>
                              <AppChip
                                label={isSaved ? "Starred" : "Star"}
                                selected={isSaved}
                                onPress={() => void handleDepthStarToggle(row)}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </AppCard>
                  );
                })}

                {depthChartData.manualReview.length > 0 ? (
                  <AppCard backgroundColor="#3f1d2a" borderColor="#7f1d1d">
                    <Text style={{ color: "#fecaca", fontWeight: "900", marginBottom: 8 }}>
                      Manual Review Required
                    </Text>
                    {depthChartData.manualReview.map((item) => (
                      <Text
                        key={`${item.playerId}-${item.requestedPosition}`}
                        style={{ color: "#fee2e2", marginBottom: 6 }}
                      >
                        {item.playerName} — {item.requestedPosition} ({item.reason})
                      </Text>
                    ))}
                  </AppCard>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      <PlayerDetailModal
        player={selectedModalPlayer}
        visible={selectedModalPlayer !== null}
        watched={
          selectedModalPlayer
            ? isInWatchlist(leagueId, selectedModalPlayer.id)
            : false
        }
        custom={
          selectedModalPlayer ? isCustomPlayer(selectedModalPlayer.id) : false
        }
        displayValue={selectedDisplayValue}
        displayTier={selectedDisplayTier}
        statSummary={selectedStatSummary}
        onClose={() => setSelectedModalPlayer(null)}
        onToggleWatchlist={() => {
          if (selectedModalPlayer) {
            void handleToggleWatchlist(selectedModalPlayer);
          }
        }}
        onMoveToCommandCenter={() => {
          if (selectedModalPlayer) {
            handleMoveToCommandCenter(selectedModalPlayer);
          }
        }}
        onEditCustom={() => {
          if (selectedModalPlayer) {
            startEditingCustomPlayer(selectedModalPlayer);
            setSelectedModalPlayer(null);
          }
        }}
        onRemoveCustom={() => {
          if (selectedModalPlayer) {
            void removeCustomPlayer(selectedModalPlayer.id);
            setSelectedModalPlayer(null);
          }
        }}
      />
    </SafeAreaView>
  );
}

