import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  RefreshControl,
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
import PositionBadge from "../components/ui/PositionBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import {
  draftSetHasPlayer,
  resolvePlayerDraftState,
} from "../domain/draftState";
import {
  MOBILE_TIER_SORT_OPTIONS,
  buildMobileTierView,
  formatMobileTierAvailability,
  getMobileTierMapValue,
  sortPlayersForMobileTier,
  type MobileTierBucket,
  type MobileTierSortField,
} from "../domain/researchTiers";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import {
  type StatBasis,
  formatResearchStatSummaryLine,
  getDisplayStatValue,
  parseStatBasis,
  resolveDisplayStats,
  RESEARCH_STAT_BASIS_STORAGE_KEY_MOBILE,
} from "@repo/player-stat-basis";

type Props = BottomTabScreenProps<LeagueTabParamList, "Research">;

type DepthChartModalContext = {
  position: DepthChartPosition;
  rank: number;
  status: string;
  usageStarts: number;
  usageAppearances: number;
  outOfPosition?: boolean;
  needsManualReview?: boolean;
  reasons?: string[];
};

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
  | "model_tier"
  | "model_rank"
  | `stat:${string}:${string}`;

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

type SortOption = { label: string; value: ResearchSort };

type StatSortOption = SortOption & {
  hitting?: string;
  pitching?: string;
};

const CORE_SORT_OPTIONS: SortOption[] = [
  { label: "Market ADP", value: "market_adp" },
  { label: "Auction Rank", value: "auction_rank" },
  { label: "Auction Value", value: "auction_value" },
];

const MODEL_SORT_OPTIONS: SortOption[] = [
  { label: "Model Tier", value: "model_tier" },
  { label: "Model Rank", value: "model_rank" },
];

function makeStatSortValue(
  hitting: string | undefined,
  pitching: string | undefined,
): ResearchSort {
  return `stat:${hitting ?? ""}:${pitching ?? ""}` as ResearchSort;
}

function parseStatSortValue(
  sortBy: ResearchSort,
): { hitting?: string; pitching?: string } | null {
  if (!sortBy.startsWith("stat:")) {
    return null;
  }

  const parts = sortBy.split(":");
  const hitting = parts[1] || undefined;
  const pitching = parts[2] || undefined;

  return { hitting, pitching };
}

function buildDynamicStatSortOptions(
  researchStatKeys: ResearchStatKeys,
  statViewFilter: StatViewFilter,
): StatSortOption[] {
  if (statViewFilter === "hitting") {
    return researchStatKeys.hitting.map((key) => ({
      label: key,
      value: makeStatSortValue(key, undefined),
      hitting: key,
    }));
  }

  if (statViewFilter === "pitching") {
    return researchStatKeys.pitching.map((key) => ({
      label: key,
      value: makeStatSortValue(undefined, key),
      pitching: key,
    }));
  }

  const options: StatSortOption[] = [];
  const maxLength = Math.max(
    researchStatKeys.hitting.length,
    researchStatKeys.pitching.length,
  );

  for (let i = 0; i < maxLength; i += 1) {
    const hitting = researchStatKeys.hitting[i];
    const pitching = researchStatKeys.pitching[i];

    if (!hitting && !pitching) {
      continue;
    }

    const label =
      hitting && pitching
        ? `${hitting} / ${pitching}`
        : hitting ?? pitching ?? "";

    options.push({
      label,
      value: makeStatSortValue(hitting, pitching),
      hitting,
      pitching,
    });
  }

  return options;
}

function sortOptionsForResearchStats(
  researchStatKeys: ResearchStatKeys,
  showEngineValues: boolean,
  statViewFilter: StatViewFilter,
): SortOption[] {
  const baseOptions = [
    ...CORE_SORT_OPTIONS,
    ...buildDynamicStatSortOptions(researchStatKeys, statViewFilter),
  ];

  if (showEngineValues) {
    return [...MODEL_SORT_OPTIONS, ...baseOptions];
  }

  return baseOptions;
}

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

const HITTER_STAT_KEYS = ["AVG", "HR", "RBI", "R", "SB"];
const PITCHER_STAT_KEYS = ["ERA", "K", "W", "SV", "WHIP"];

const SUPPORTED_HITTER_STAT_KEYS = [
  "R",
  "HR",
  "RBI",
  "SB",
  "AVG",
  "OBP",
  "SLG",
  "TB",
  "H",
  "BB",
  "K",
];

const SUPPORTED_PITCHER_STAT_KEYS = [
  "W",
  "K",
  "ERA",
  "WHIP",
  "SV",
  "IP",
  "HLD",
  "CG",
];

type ResearchStatKeys = {
  hitting: string[];
  pitching: string[];
};

const INITIAL_PLAYER_RENDER_COUNT = 30;
const PLAYER_RENDER_INCREMENT = 30;

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

function normalizeStatKey(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();

  if (!normalized) return null;
  if (normalized === "RUNS") return "R";
  if (normalized === "HOME_RUNS" || normalized === "HOMERUNS" || normalized === "HOME RUNS") return "HR";
  if (normalized === "STOLEN_BASES" || normalized === "STOLEN BASES") return "SB";
  if (normalized === "RUNS_BATTED_IN" || normalized === "RUNS BATTED IN") return "RBI";
  if (normalized === "BATTING_AVERAGE" || normalized === "BATTING AVERAGE") return "AVG";
  if (normalized === "ON_BASE_PERCENTAGE" || normalized === "ON-BASE PERCENTAGE" || normalized === "ON BASE PERCENTAGE") return "OBP";
  if (normalized === "SLUGGING_PERCENTAGE" || normalized === "SLUGGING PERCENTAGE") return "SLG";
  if (normalized === "TOTAL_BASES" || normalized === "TOTAL BASES") return "TB";
  if (normalized === "WALKS") return "BB";
  if (normalized === "WINS") return "W";
  if (normalized === "STRIKEOUTS" || normalized === "SO") return "K";
  if (normalized === "EARNED_RUN_AVERAGE" || normalized === "EARNED RUN AVERAGE") return "ERA";
  if (normalized === "WALKS_+_HITS_PER_IP" || normalized === "WALKS + HITS PER IP" || normalized === "WALKS AND HITS PER IP") return "WHIP";
  if (normalized === "SAVES") return "SV";
  if (normalized === "HOLDS") return "HLD";
  if (normalized === "INNINGS_PITCHED" || normalized === "INNINGS PITCHED") return "IP";
  if (normalized === "COMPLETE_GAMES" || normalized === "COMPLETE GAMES") return "CG";

  return normalized;
}

function statAbbrevFromScoringCategoryName(name: string): string {
  const match = name.match(/\(([^)]+)\)\s*$/);
  return normalizeStatKey(match?.[1] ?? name) ?? name.trim().toUpperCase();
}

function scoringCategoryType(value: unknown): "hitting" | "pitching" | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const rawType = typeof record.type === "string" ? record.type.toLowerCase() : "";

  if (rawType === "batting" || rawType === "hitting" || rawType === "hitters" || rawType === "offense") {
    return "hitting";
  }

  if (rawType === "pitching" || rawType === "pitchers") {
    return "pitching";
  }

  return null;
}

function scoringCategoryName(value: unknown): string | null {
  if (typeof value === "string") return value;

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  if (typeof record.name === "string") return record.name;
  if (typeof record.label === "string") return record.label;
  if (typeof record.key === "string") return record.key;

  return null;
}

function uniqueSupportedStats(values: unknown[], supported: string[], fallback: string[]): string[] {
  const result: string[] = [];

  for (const value of values) {
    const name = scoringCategoryName(value);
    const normalized = name
      ? statAbbrevFromScoringCategoryName(name)
      : normalizeStatKey(value);

    if (normalized && supported.includes(normalized) && !result.includes(normalized)) {
      result.push(normalized);
    }
  }

  return result.length > 0 ? result : fallback;
}

function arrayFromUnknown(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.categories)) return record.categories;
    if (Array.isArray(record.stats)) return record.stats;
    if (Array.isArray(record.selected)) return record.selected;
  }

  return [];
}

function extractScoringSide(
  scoringCategories: unknown,
  side: "hitting" | "pitching",
): unknown[] {
  if (!scoringCategories) return [];

  if (Array.isArray(scoringCategories)) {
    return scoringCategories;
  }

  if (typeof scoringCategories !== "object") return [];

  const record = scoringCategories as Record<string, unknown>;

  if (side === "hitting") {
    return [
      ...arrayFromUnknown(record.hitting),
      ...arrayFromUnknown(record.batting),
      ...arrayFromUnknown(record.hitters),
      ...arrayFromUnknown(record.offense),
    ];
  }

  return [
    ...arrayFromUnknown(record.pitching),
    ...arrayFromUnknown(record.pitchers),
  ];
}

function getLeagueResearchStatKeys(league: unknown): ResearchStatKeys {
  const record = league as { scoringCategories?: unknown } | null | undefined;
  const scoringCategories = record?.scoringCategories;

  if (Array.isArray(scoringCategories)) {
    const hittingRaw: string[] = [];
    const pitchingRaw: string[] = [];
    const untypedRaw: string[] = [];

    for (const category of scoringCategories) {
      const name = scoringCategoryName(category);
      if (!name) continue;

      const abbrev = statAbbrevFromScoringCategoryName(name);
      const type = scoringCategoryType(category);

      if (type === "hitting") {
        hittingRaw.push(abbrev);
      } else if (type === "pitching") {
        pitchingRaw.push(abbrev);
      } else {
        untypedRaw.push(abbrev);
      }
    }

    if (untypedRaw.length > 0) {
      for (const abbrev of untypedRaw) {
        if (SUPPORTED_HITTER_STAT_KEYS.includes(abbrev)) {
          hittingRaw.push(abbrev);
        }

        if (SUPPORTED_PITCHER_STAT_KEYS.includes(abbrev)) {
          pitchingRaw.push(abbrev);
        }
      }
    }

    return {
      hitting: uniqueSupportedStats(
        hittingRaw,
        SUPPORTED_HITTER_STAT_KEYS,
        HITTER_STAT_KEYS,
      ),
      pitching: uniqueSupportedStats(
        pitchingRaw,
        SUPPORTED_PITCHER_STAT_KEYS,
        PITCHER_STAT_KEYS,
      ),
    };
  }

  return {
    hitting: uniqueSupportedStats(
      extractScoringSide(scoringCategories, "hitting"),
      SUPPORTED_HITTER_STAT_KEYS,
      HITTER_STAT_KEYS,
    ),
    pitching: uniqueSupportedStats(
      extractScoringSide(scoringCategories, "pitching"),
      SUPPORTED_PITCHER_STAT_KEYS,
      PITCHER_STAT_KEYS,
    ),
  };
}

function statDigits(key: string): number {
  if (["AVG", "OBP", "SLG"].includes(key)) return 3;
  if (["ERA", "WHIP"].includes(key)) return 2;
  if (key === "IP") return 1;
  return 0;
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

function lookupDraftedPrice(
  map: ReadonlyMap<string, number> | undefined,
  player: Player,
): number | null {
  if (!map) return null;

  const direct = map.get(player.id);
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  if (player.mlbId !== undefined && player.mlbId !== null) {
    const byMlbId = map.get(String(player.mlbId));
    if (typeof byMlbId === "number" && Number.isFinite(byMlbId)) return byMlbId;
  }

  return null;
}

function lookupDraftedContract(
  map: ReadonlyMap<string, string> | undefined,
  player: Player,
): string | undefined {
  if (!map) return undefined;

  const direct = map.get(player.id);
  if (direct) return direct;

  if (player.mlbId !== undefined && player.mlbId !== null) {
    return map.get(String(player.mlbId));
  }

  return undefined;
}

function parseDraftedPriceFromContract(contract: string | undefined): number | null {
  if (!contract) return null;

  const match = contract.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAuctionSortValue(
  player: Player,
  row: ValuationResult | undefined,
  draftedIds: ReadonlySet<string> | undefined,
  draftedPriceByPlayerId: ReadonlyMap<string, number> | undefined,
  draftedContractByPlayerId: ReadonlyMap<string, string> | undefined,
): number | null {
  if (draftedIds && draftSetHasPlayer(draftedIds, player)) {
    const paidPrice =
      lookupDraftedPrice(draftedPriceByPlayerId, player) ??
      parseDraftedPriceFromContract(
        lookupDraftedContract(draftedContractByPlayerId, player),
      );

    if (paidPrice !== null) {
      return paidPrice;
    }
  }

  return getAuctionValue(player, row);
}

function getAuctionRank(player: Player, row?: ValuationResult): number | null {
  return (
    valuationNumber(row, "auction_rank") ??
    playerNumber(player, "auction_rank") ??
    playerNumber(player, "catalog_rank") ??
    playerNumber(player, "adp")
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
    playerNumber(player, "market_adp") ??
    playerNumber(player, "adp")
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

function positionTokens(player: Player): string[] {
  const source = player.positions?.length ? player.positions : [player.position];

  return source
    .flatMap((position) => String(position ?? "").split(/[/,|]/))
    .map((position) => position.trim().toUpperCase())
    .filter(Boolean);
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

function playerUsesBattingStats(player: Player, statBasis: StatBasis): boolean {
  const { bat, pit } = resolveDisplayStats(player, statBasis);
  return Boolean(bat) || !pit;
}

function getStatValue(
  player: Player,
  key: string,
  statBasis: StatBasis,
  statSummary: string,
): number | null {
  const { bat, pit } = resolveDisplayStats(player, statBasis);
  const normalizedKey = normalizeStatKey(key) ?? key.toUpperCase();
  const isBatter = Boolean(bat) || !pit;
  const side = isBatter ? "batting" : "pitching";
  const displayValue = getDisplayStatValue(
    normalizedKey,
    side,
    bat,
    pit,
    player,
    statBasis,
  );
  const parsedDisplayValue = finiteNumber(displayValue);

  if (parsedDisplayValue !== null) {
    return parsedDisplayValue;
  }

  const parsed = parseStatSummary(statSummary);

  return parsed[normalizedKey] ?? parsed[key] ?? null;
}

function statKeysForPlayer(
  player: Player,
  statViewFilter: StatViewFilter,
  researchStatKeys: ResearchStatKeys,
): string[] {
  if (statViewFilter === "hitting") {
    return researchStatKeys.hitting;
  }

  if (statViewFilter === "pitching") {
    return researchStatKeys.pitching;
  }

  if (hasHittingProfile(player)) {
    return researchStatKeys.hitting;
  }

  return isPitcher(player) ? researchStatKeys.pitching : researchStatKeys.hitting;
}

function statSortKeyForPlayer(
  sortBy: ResearchSort,
  player: Player,
  statBasis: StatBasis,
): string | null {
  const parsed = parseStatSortValue(sortBy);

  if (!parsed) {
    return null;
  }

  if (playerUsesBattingStats(player, statBasis)) {
    return parsed.hitting ?? parsed.pitching ?? null;
  }

  return parsed.pitching ?? parsed.hitting ?? null;
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
  draftedIds?: ReadonlySet<string>,
  draftedPriceByPlayerId?: ReadonlyMap<string, number>,
  draftedContractByPlayerId?: ReadonlyMap<string, string>,
): number {
  if (sortBy === "auction_value") {
    return sortMissingLast(
      getAuctionSortValue(
        a,
        rowA,
        draftedIds,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
      ),
      getAuctionSortValue(
        b,
        rowB,
        draftedIds,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
      ),
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

  if (sortBy === "model_tier") {
    return sortMissingLast(
      getModelTier(a, rowA),
      getModelTier(b, rowB),
      direction,
    );
  }

  if (sortBy === "model_rank") {
    return sortMissingLast(
      getModelRank(a, rowA),
      getModelRank(b, rowB),
      direction,
    );
  }

  const keyA = statSortKeyForPlayer(sortBy, a, statBasis);
  const keyB = statSortKeyForPlayer(sortBy, b, statBasis);
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

function MetricPositionCell({ player }: { player: Player }) {
  const positions = positionTokens(player);

  return (
    <View
      style={{
        width: "50%",
        paddingRight: 8,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: "#a1a1aa", fontSize: 11, fontWeight: "800" }}>
        Pos
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
        {positions.length > 0 ? (
          positions.map((position) => (
            <PositionBadge key={position} label={position} small />
          ))
        ) : (
          <Text style={{ color: "#f9fafb", fontSize: 15, fontWeight: "900" }}>
            —
          </Text>
        )}
      </View>
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
  researchStatKeys,
}: {
  player: Player;
  statBasis: StatBasis;
  statSummary: string;
  statViewFilter: StatViewFilter;
  researchStatKeys: ResearchStatKeys;
}) {
  const keys = statKeysForPlayer(player, statViewFilter, researchStatKeys);

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
        const digits = statDigits(key);

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
  researchStatKeys,
  note,
  onChangeNote,
  draftedByTeam,
  draftedPrice,
  draftedContract,
  isDrafted = false,
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
  researchStatKeys: ResearchStatKeys;
  note: string;
  onChangeNote: (note: string) => void;
  draftedByTeam?: string;
  draftedPrice?: number;
  draftedContract?: string;
  isDrafted?: boolean;
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
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const trimmedNote = note.trim();
  const draftedDisplayLabel = isDrafted
    ? `${draftedByTeam ?? "Drafted"}${draftedPrice !== undefined ? ` · $${Math.round(draftedPrice)}` : ""}`
    : "";

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

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 2,
              }}
            >
              <Text
                style={{
                  color: "#c4b5fd",
                  fontWeight: "800",
                  marginRight: 6,
                  marginBottom: 5,
                }}
              >
                Team: {player.team || "FA"} • Pos:
              </Text>

              {positionTokens(player).map((position) => (
                <PositionBadge key={position} label={position} small />
              ))}
            </View>

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
          <MetricPositionCell player={player} />
          <MetricCell
            label="Market ADP"
            value={isDrafted ? "—" : formatNumber(marketAdp, 2)}
          />
          <MetricCell
            label="Auction Rank"
            value={
              isDrafted
                ? "—"
                : auctionRank === null
                  ? "—"
                  : `#${Math.round(auctionRank)}`
            }
          />
          <MetricCell
            label={isDrafted ? "Drafted" : "Auction Value"}
            value={isDrafted ? draftedDisplayLabel : formatMoney(displayValue)}
            highlight={!isDrafted}
          />
        </View>

        {showEngineValues ? (
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
                Model Tier
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

        {isDrafted && draftedContract ? (
          <Text style={{ color: "#a1a1aa", fontWeight: "800", marginTop: 4 }}>
            Contract: {draftedContract}
          </Text>
        ) : null}

        <StatGrid
          player={player}
          statBasis={statBasis}
          statSummary={statSummary}
          statViewFilter={statViewFilter}
          researchStatKeys={researchStatKeys}
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
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: noteEditorOpen ? 6 : 0,
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: "#a1a1aa", fontSize: 11, fontWeight: "900", marginBottom: 3 }}>
                Notes
              </Text>
              <Text numberOfLines={1} style={{ color: "#d1d5db", fontSize: 12 }}>
                {trimmedNote.length > 0 ? trimmedNote : "No note"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setNoteEditorOpen((value) => !value)}
              style={{
                borderWidth: 1,
                borderColor: "#4c3575",
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: "#1b1428",
              }}
            >
              <Text style={{ color: "#c4b5fd", fontSize: 12, fontWeight: "900" }}>
                {noteEditorOpen ? "Done" : trimmedNote.length > 0 ? "Edit" : "Add"}
              </Text>
            </TouchableOpacity>
          </View>

          {noteEditorOpen ? (
            <>
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
              {trimmedNote.length > 0 ? (
                <TouchableOpacity
                  onPress={() => onChangeNote("")}
                  style={{ alignSelf: "flex-start", marginTop: 6 }}
                >
                  <Text style={{ color: "#c4b5fd", fontSize: 12, fontWeight: "900" }}>
                    Clear note
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
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

  const researchStatKeys = useMemo(
    () => getLeagueResearchStatKeys(league),
    [league?.scoringCategories],
  );

  const [rosterForValuation, setRosterForValuation] = useState<RosterEntry[]>([]);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState<Player | null>(null);
  const [selectedDepthContext, setSelectedDepthContext] =
    useState<DepthChartModalContext | null>(null);

  const draftedIds = useMemo(() => {
    return new Set(rosterForValuation.map((entry) => entry.externalPlayerId));
  }, [rosterForValuation]);

  const draftedByTeam = useMemo(() => {
    const map = new Map<string, string>();

    for (const entry of rosterForValuation) {
      const teamNumber = Number(String(entry.teamId).replace("team_", ""));
      const teamName =
        Number.isFinite(teamNumber) && teamNumber > 0
          ? league?.teamNames?.[teamNumber - 1] ?? entry.teamId
          : entry.teamId;

      map.set(entry.externalPlayerId, teamName);
    }

    return map;
  }, [rosterForValuation, league?.teamNames]);

  const draftedPriceByPlayerId = useMemo(() => {
    const map = new Map<string, number>();

    for (const entry of rosterForValuation) {
      map.set(entry.externalPlayerId, entry.price);
    }

    return map;
  }, [rosterForValuation]);

  const draftedContractByPlayerId = useMemo(() => {
    const map = new Map<string, string>();

    for (const entry of rosterForValuation) {
      if (entry.keeperContract) {
        map.set(entry.externalPlayerId, entry.keeperContract);
      }
    }

    return map;
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
        "catalog_rank",
        league?.posEligibilityThreshold,
        league?.playerPool,
      ) ?? [],
  );
  const [playersError, setPlayersError] = useState("");
  const [loadingPlayers, setLoadingPlayers] = useState(
    () =>
      getPlayersCached(
        "catalog_rank",
        league?.posEligibilityThreshold,
        league?.playerPool,
      ) === null,
  );
  const [refreshing, setRefreshing] = useState(false);

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
  const [visiblePlayerCount, setVisiblePlayerCount] = useState(INITIAL_PLAYER_RENDER_COUNT);
  const [tierSortBy, setTierSortBy] =
    useState<MobileTierSortField>("auction_value");
  const [expandedTierKeys, setExpandedTierKeys] = useState<Record<string, boolean>>({});

  const sortOptions = useMemo(
    () =>
      sortOptionsForResearchStats(
        researchStatKeys,
        showEngineValues,
        statViewFilter,
      ),
    [researchStatKeys, showEngineValues, statViewFilter],
  );

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
  const [depthChartSearch, setDepthChartSearch] = useState("");

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
    if (!sortOptions.some((option) => option.value === sortBy)) {
      setSortBy("auction_value");
      setSortDirection("desc");
    }
  }, [sortOptions, sortBy]);

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
        "catalog_rank",
        league?.posEligibilityThreshold,
        league?.playerPool,
      );

      if (!cached) {
        setLoadingPlayers(true);
      }

      setPlayersError("");

      try {
        const data = await getPlayers(
          "catalog_rank",
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPlayersError("");

    try {
      await Promise.all([
        loadWatchlist(leagueId),
        loadNotes(leagueId),
      ]);

      let nextPlayers = players;

      if (selectedView === "player-database" || selectedView === "tiers") {
        nextPlayers = await getPlayers(
          "catalog_rank",
          league?.posEligibilityThreshold,
          league?.playerPool,
        );
        setPlayers(nextPlayers);
      }

      let nextRosterForValuation = rosterForValuation;

      if (token && leagueId) {
        nextRosterForValuation = await getRoster(leagueId, token).catch(() => []);
        setRosterForValuation(nextRosterForValuation);
      }

      if (token && leagueId && nextPlayers.length > 0) {
        const response = await getValuation(leagueId, token, "team_1", {
          leagueConfigKey: leagueValuationKey,
          rosterFingerprint: rosterValuationFingerprint(nextRosterForValuation),
        }).catch(() => null);

        if (response) {
          const customPlayerIdSet = new Set(
            customPlayerIdsKey.length > 0 ? customPlayerIdsKey.split("\u0001") : [],
          );
          const merged = new Map<string, ValuationResult>();

          for (const row of response.valuations) {
            if (customPlayerIdSet.has(row.player_id)) continue;

            merged.set(row.player_id, row);

            const matchedPlayer = nextPlayers.find((player) =>
              playerMatchesValuationRow(player, row),
            );

            if (matchedPlayer) {
              merged.set(matchedPlayer.id, row);
            }
          }

          setValuationsByPlayerId(merged);
        }
      }

      if (selectedView === "depth-charts") {
        await loadDepthChart(selectedDepthTeamId, true);
      }
    } catch (err) {
      setPlayersError(
        err instanceof Error ? err.message : "Failed to refresh research.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [
    customPlayerIdsKey,
    league?.playerPool,
    league?.posEligibilityThreshold,
    leagueId,
    leagueValuationKey,
    loadDepthChart,
    loadNotes,
    loadWatchlist,
    players,
    rosterForValuation,
    selectedDepthTeamId,
    selectedView,
    token,
  ]);

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
      const drafted = draftSetHasPlayer(draftedIds, player);
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
        draftedIds,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
      ),
    );
  }, [
    filteredPlayers,
    valuationsByPlayerId,
    sortBy,
    sortDirection,
    statBasis,
    showEngineValues,
    draftedIds,
    draftedPriceByPlayerId,
    draftedContractByPlayerId,
  ]);

  useEffect(() => {
    setVisiblePlayerCount(INITIAL_PLAYER_RENDER_COUNT);
  }, [
    search,
    positionFilter,
    availabilityFilter,
    injuryFilter,
    statViewFilter,
    starredOnly,
    statBasis,
    sortBy,
    sortDirection,
    selectedTags,
    showEngineValues,
    selectedView,
  ]);

  const visibleSortedPlayers = useMemo(() => {
    return sortedFilteredPlayers.slice(0, visiblePlayerCount);
  }, [sortedFilteredPlayers, visiblePlayerCount]);

  const tierCandidatePlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allPlayers.filter((player) => {
      const nameMatch = player.name.toLowerCase().includes(q);
      const teamMatch = player.team.toLowerCase().includes(q);
      const positionText = [player.position, ...(player.positions ?? [])]
        .join("/")
        .toLowerCase();
      const positionTextMatch = positionText.includes(q);

      if (q && !nameMatch && !teamMatch && !positionTextMatch) {
        return false;
      }

      return positionMatches(player, positionFilter);
    });
  }, [allPlayers, search, positionFilter]);

  const mobileTierView = useMemo(
    () =>
      buildMobileTierView({
        players: tierCandidatePlayers,
        valuationsByPlayerId,
        draftedIds,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
        leagueBudget: league?.budget,
      }),
    [
      tierCandidatePlayers,
      valuationsByPlayerId,
      draftedIds,
      draftedPriceByPlayerId,
      draftedContractByPlayerId,
      league?.budget,
    ],
  );

  const mobileTierBuckets = useMemo(() => {
    const buckets: MobileTierBucket[] = [...mobileTierView.tiers];

    if (mobileTierView.outsideModel) {
      buckets.push(mobileTierView.outsideModel);
    }

    return buckets;
  }, [mobileTierView]);

  function toggleTierExpanded(key: string) {
    setExpandedTierKeys((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  const depthTotalSlots = DEPTH_POSITIONS.length * 3;

  const depthAssignedCount = useMemo(() => {
    if (!depthChartData) return 0;

    return DEPTH_POSITIONS.reduce(
      (total, position) => total + (depthChartData.positions[position]?.length ?? 0),
      0,
    );
  }, [depthChartData]);

  const selectedDepthTeam = useMemo(
    () => MLB_TEAMS.find((team) => team.id === selectedDepthTeamId) ?? MLB_TEAMS[0],
    [selectedDepthTeamId],
  );

  const depthValuedCount = useMemo(() => {
    if (!depthChartData) return 0;

    let count = 0;

    for (const position of DEPTH_POSITIONS) {
      const rows = depthChartData.positions[position] ?? [];

      for (const row of rows) {
        const matchedPlayer =
          allPlayers.find(
            (player) =>
              player.mlbId === row.playerId || player.id === String(row.playerId),
          ) ?? null;

        if (!matchedPlayer) continue;

        const engineRow = valuationsByPlayerId.get(matchedPlayer.id);
        const value = getAuctionValue(matchedPlayer, engineRow);

        if (value > 0) {
          count += 1;
        }
      }
    }

    return count;
  }, [depthChartData, allPlayers, valuationsByPlayerId]);

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

  function handleOpenPlayer(
    player: Player,
    depthContext: DepthChartModalContext | null = null,
  ) {
    setSelectedDepthContext(depthContext);
    setSelectedModalPlayer(player);
  }

  function handleMoveToCommandCenter(player: Player) {
    setSelectedPlayer(player);
    setSelectedModalPlayer(null);
    setSelectedDepthContext(null);
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
      value === "model_rank"
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
      "catalog_rank",
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

  async function handleDepthPlayerPress(
    slot: DepthChartPlayerRow,
    position: DepthChartPosition,
  ) {
    try {
      const player = await resolveDepthPlayer(slot);

      if (!player) {
        setDepthChartError(
          `Could not open ${slot.playerName}. Player record was not found.`,
        );
        return;
      }

      handleOpenPlayer(player, {
        position,
        rank: slot.rank,
        status: slot.status,
        usageStarts: slot.usageStarts,
        usageAppearances: slot.usageAppearances,
        outOfPosition: slot.outOfPosition,
        needsManualReview: slot.needsManualReview,
        reasons: slot.reasons,
      });
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

  const selectedDraftState = selectedModalPlayer
    ? resolvePlayerDraftState({
        player: selectedModalPlayer,
        draftedIds,
        draftedByTeam,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
      })
    : null;

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
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: "#0b0712" }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 110,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#a78bfa"
            colors={["#a78bfa"]}
            onRefresh={() => void handleRefresh()}
          />
        }
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
            {selectedView === "player-database" ? (
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
                  value={`${sortOptions.find((option) => option.value === sortBy)?.label ?? "Auction Value"} ${
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
                  {sortOptions.map((option) => (
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

              </>
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
                  <>
                    {visibleSortedPlayers.map((item, index) => {
                      const watched = isInWatchlist(leagueId, item.id);
                      const engineRow = valuationsByPlayerId.get(item.id);
                      const custom = isCustomPlayer(item.id);
                      const draftState = resolvePlayerDraftState({
                        player: item,
                        draftedIds,
                        draftedByTeam,
                        draftedPriceByPlayerId,
                        draftedContractByPlayerId,
                      });

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
                          researchStatKeys={researchStatKeys}
                          note={getNote(leagueId, item.id)}
                          onChangeNote={(note) => setNote(leagueId, item.id, note)}
                          draftedByTeam={draftState.teamName}
                          draftedPrice={draftState.paid}
                          draftedContract={draftState.contract}
                          isDrafted={draftState.isDrafted}
                          showEngineValues={showEngineValues}
                          onOpen={() => handleOpenPlayer(item)}
                          onToggleWatchlist={() => void handleToggleWatchlist(item)}
                          onEditCustom={() => startEditingCustomPlayer(item)}
                          onRemoveCustom={() => void removeCustomPlayer(item.id)}
                        />
                      );
                    })}

                    {visibleSortedPlayers.length < sortedFilteredPlayers.length ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() =>
                          setVisiblePlayerCount((count) =>
                            Math.min(
                              count + PLAYER_RENDER_INCREMENT,
                              sortedFilteredPlayers.length,
                            ),
                          )
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: "#4c3575",
                          borderRadius: 14,
                          paddingVertical: 12,
                          alignItems: "center",
                          backgroundColor: "#151021",
                          marginBottom: 12,
                        }}
                      >
                        <Text style={{ color: "#f9fafb", fontWeight: "900" }}>
                          Load {Math.min(
                            PLAYER_RENDER_INCREMENT,
                            sortedFilteredPlayers.length - visibleSortedPlayers.length,
                          )} more players
                        </Text>
                        <Text style={{ color: "#a1a1aa", fontSize: 12, marginTop: 3 }}>
                          Showing {visibleSortedPlayers.length} of {sortedFilteredPlayers.length}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <>
                <AppCard backgroundColor="#151021" borderColor="#31224f">
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text
                        style={{
                          color: "#f9fafb",
                          fontSize: 18,
                          fontWeight: "900",
                          marginBottom: 6,
                        }}
                      >
                        Auction tiers
                      </Text>

                      <Text style={{ color: "#c4b5fd", lineHeight: 19 }}>
                        Value bands from the current Engine auction board. Tiers
                        and cliffs use auction values; drafted-only tiers are hidden
                        from the main list.
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        color: "#a1a1aa",
                        fontSize: 11,
                        fontWeight: "900",
                        marginBottom: 6,
                      }}
                    >
                      POSITION
                    </Text>

                    <FilterRow>
                      {ALL_POSITION_FILTERS.map((position) => (
                        <FilterPill
                          key={position}
                          label={position === "ALL" ? "All Positions" : position}
                          selected={positionFilter === position}
                          onPress={() => setPositionFilter(position)}
                        />
                      ))}
                    </FilterRow>
                  </View>

                  <View>
                    <Text
                      style={{
                        color: "#a1a1aa",
                        fontSize: 11,
                        fontWeight: "900",
                        marginBottom: 6,
                      }}
                    >
                      SORT WITHIN TIER
                    </Text>

                    <FilterRow>
                      {MOBILE_TIER_SORT_OPTIONS.map((option) => (
                        <FilterPill
                          key={option.value}
                          label={option.label}
                          selected={tierSortBy === option.value}
                          onPress={() => setTierSortBy(option.value)}
                        />
                      ))}
                    </FilterRow>
                  </View>
                </AppCard>

                {mobileTierBuckets.length === 0 ? (
                  <EmptyState label="No players match this tier filter." />
                ) : (
                  mobileTierBuckets.map((bucket) => {
                    const expanded = expandedTierKeys[bucket.key] ?? false;
                    const sortedAvailable = sortPlayersForMobileTier(
                      bucket.availablePlayers,
                      tierSortBy,
                      valuationsByPlayerId,
                      draftedIds,
                      draftedPriceByPlayerId,
                      draftedContractByPlayerId,
                    );
                    const sortedDrafted = sortPlayersForMobileTier(
                      bucket.draftedPlayers,
                      tierSortBy,
                      valuationsByPlayerId,
                      draftedIds,
                      draftedPriceByPlayerId,
                      draftedContractByPlayerId,
                    );
                    const mixText = Object.entries(bucket.positionCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([position, count]) => `${position} ${count}`)
                      .join(" · ");

                    return (
                      <AppCard
                        key={bucket.key}
                        backgroundColor={bucket.muted ? "#100c18" : "#151021"}
                        borderColor={bucket.depleted ? "#4b2b3d" : "#31224f"}
                      >
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => toggleTierExpanded(bucket.key)}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              marginBottom: 10,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                flex: 1,
                                paddingRight: 10,
                              }}
                            >
                              {bucket.tier === "outside" ? (
                                <View
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: "#6b7280",
                                    backgroundColor: "#374151",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginRight: 10,
                                  }}
                                >
                                  <Text style={{ color: "#f9fafb", fontWeight: "900" }}>
                                    —
                                  </Text>
                                </View>
                              ) : (
                                <View style={{ marginRight: 10 }}>
                                  <TierPill tier={bucket.tier} />
                                </View>
                              )}

                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    color: "#f9fafb",
                                    fontSize: 17,
                                    fontWeight: "900",
                                  }}
                                >
                                  {bucket.title}
                                </Text>

                                {bucket.semanticLabel ? (
                                  <Text
                                    style={{
                                      color: "#c4b5fd",
                                      fontWeight: "800",
                                      marginTop: 1,
                                    }}
                                  >
                                    {bucket.semanticLabel}
                                    {bucket.shortRange ? ` · ${bucket.shortRange}` : ""}
                                  </Text>
                                ) : null}
                              </View>
                            </View>

                            <Text style={{ color: "#c4b5fd", fontWeight: "900" }}>
                              {expanded ? "Collapse" : "Expand"}
                            </Text>
                          </View>

                          <View
                            style={{
                              borderTopWidth: 1,
                              borderTopColor: "#33294a",
                              paddingTop: 10,
                            }}
                          >
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                              <MetricCell
                                label="Available"
                                value={
                                  bucket.availableCount <= 0
                                    ? bucket.draftedCount > 0
                                      ? `Depleted · ${bucket.draftedCount} drafted`
                                      : "Depleted"
                                    : formatMobileTierAvailability(bucket)
                                }
                              />
                              <MetricCell
                                label="Value"
                                value={
                                  bucket.depleted
                                    ? "—"
                                    : bucket.shelfNote
                                      ? `${bucket.valueLabel} (${bucket.shelfNote})`
                                      : bucket.valueLabel
                                }
                                highlight={!bucket.depleted}
                              />
                              <MetricCell
                                label="Avg"
                                value={bucket.depleted ? "—" : bucket.averageValueLabel}
                              />
                              <MetricCell
                                label="Cliff"
                                value={bucket.depleted ? "—" : bucket.cliffLabel}
                              />
                            </View>

                            {mixText ? (
                              <Text style={{ color: "#a1a1aa", marginTop: -2 }}>
                                Mix: {mixText}
                              </Text>
                            ) : null}

                            {bucket.topPlayerNames.length > 0 ? (
                              <Text style={{ color: "#a1a1aa", marginTop: 5 }}>
                                Top: {bucket.topPlayerNames.join(", ")}
                              </Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>

                        {expanded ? (
                          <View style={{ marginTop: 12 }}>
                            {sortedAvailable.length === 0 ? (
                              sortedDrafted.length === 0 ? (
                                <Text style={{ color: "#a1a1aa", marginBottom: 10 }}>
                                  No players match this tier.
                                </Text>
                              ) : null
                            ) : (
                              sortedAvailable.map((player, index) => {
                                const engineRow = valuationsByPlayerId.get(player.id);
                                const watched = isInWatchlist(leagueId, player.id);
                                const custom = isCustomPlayer(player.id);
                                const draftState = resolvePlayerDraftState({
                                  player,
                                  draftedIds,
                                  draftedByTeam,
                                  draftedPriceByPlayerId,
                                  draftedContractByPlayerId,
                                });

                                return (
                                  <PlayerResearchCard
                                    key={`available-${bucket.key}-${player.id}`}
                                    player={player}
                                    engineRow={engineRow}
                                    watched={watched}
                                    custom={custom}
                                    rankNumber={index + 1}
                                    statBasis={statBasis}
                                    statViewFilter={statViewFilter}
                                    researchStatKeys={researchStatKeys}
                                    note={getNote(leagueId, player.id)}
                                    onChangeNote={(note) => setNote(leagueId, player.id, note)}
                                    draftedByTeam={draftState.teamName}
                                    draftedPrice={draftState.paid}
                                    draftedContract={draftState.contract}
                                    isDrafted={draftState.isDrafted}
                                    showEngineValues={showEngineValues}
                                    onOpen={() => handleOpenPlayer(player)}
                                    onToggleWatchlist={() => void handleToggleWatchlist(player)}
                                    onEditCustom={() => startEditingCustomPlayer(player)}
                                    onRemoveCustom={() => void removeCustomPlayer(player.id)}
                                  />
                                );
                              })
                            )}

                            {sortedDrafted.length > 0 ? (
                              <>
                                <Text
                                  style={{
                                    color: "#f9fafb",
                                    fontSize: 15,
                                    fontWeight: "900",
                                    marginTop: 8,
                                    marginBottom: 10,
                                  }}
                                >
                                  DRAFTED FROM THIS TIER
                                </Text>

                                {sortedDrafted.map((player, index) => {
                                  const engineRow = valuationsByPlayerId.get(player.id);
                                  const watched = isInWatchlist(leagueId, player.id);
                                  const custom = isCustomPlayer(player.id);
                                  const draftState = resolvePlayerDraftState({
                                    player,
                                    draftedIds,
                                    draftedByTeam,
                                    draftedPriceByPlayerId,
                                    draftedContractByPlayerId,
                                  });
                                  const draftedTeam = draftState.teamName;
                                  const draftedPrice = draftState.paid;

                                  return (
                                    <View key={`drafted-${bucket.key}-${player.id}`}>
                                      <Text
                                        style={{
                                          color: "#a1a1aa",
                                          fontSize: 12,
                                          fontWeight: "900",
                                          marginBottom: 6,
                                        }}
                                      >
                                        Drafted
                                        {draftedTeam ? ` by ${draftedTeam}` : ""}
                                        {draftedPrice !== undefined ? ` for $${draftedPrice}` : ""}
                                      </Text>

                                      <PlayerResearchCard
                                        player={player}
                                        engineRow={engineRow}
                                        watched={watched}
                                        custom={custom}
                                        rankNumber={index + 1}
                                        statBasis={statBasis}
                                        statViewFilter={statViewFilter}
                                        researchStatKeys={researchStatKeys}
                                        note={getNote(leagueId, player.id)}
                                        onChangeNote={(note) => setNote(leagueId, player.id, note)}
                                        draftedByTeam={draftState.teamName}
                                        draftedPrice={draftState.paid}
                                        draftedContract={draftState.contract}
                                        isDrafted={draftState.isDrafted}
                                        showEngineValues={showEngineValues}
                                        onOpen={() => handleOpenPlayer(player)}
                                        onToggleWatchlist={() => void handleToggleWatchlist(player)}
                                        onEditCustom={() => startEditingCustomPlayer(player)}
                                        onRemoveCustom={() => void removeCustomPlayer(player.id)}
                                      />
                                    </View>
                                  );
                                })}
                              </>
                            ) : null}
                          </View>
                        ) : null}
                      </AppCard>
                    );
                  })
                )}
              </>
            )}
          </>
        ) : (
          <>
            <AppCard backgroundColor="#151021" borderColor="#31224f">
              <Text
                style={{
                  color: "#f9fafb",
                  fontSize: 20,
                  fontWeight: "900",
                  marginBottom: 6,
                }}
              >
                Depth Charts
              </Text>
              <Text style={{ color: "#c4b5fd", marginBottom: 12, lineHeight: 20 }}>
                Fantasy-oriented active roster depth with starter, backup, and reserve rankings.
              </Text>

              <TextInput
                value={depthChartSearch}
                onChangeText={setDepthChartSearch}
                placeholder="Search depth chart players..."
                placeholderTextColor="#71717a"
                style={{
                  borderWidth: 1,
                  borderColor: "#3f335c",
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  color: "#f9fafb",
                  backgroundColor: "#0b0712",
                }}
              />

              <Text
                style={{
                  color: "#a1a1aa",
                  fontSize: 11,
                  fontWeight: "900",
                  marginBottom: 6,
                }}
              >
                MLB TEAM
              </Text>
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

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: "#f9fafb", fontWeight: "900" }}>
                  {selectedDepthTeam?.abbr ?? "MLB"} · {selectedDepthTeam?.name ?? "Team"}
                </Text>
                <AppChip
                  label="Refresh"
                  selected
                  onPress={() => void loadDepthChart(selectedDepthTeamId, true)}
                />
              </View>
            </AppCard>

            {depthChartError ? <ErrorState label={depthChartError} /> : null}

            {isLoadingDepthChart ? (
              <LoadingState label="Loading depth chart..." />
            ) : !depthChartData ? (
              <EmptyState label="No depth chart data available." />
            ) : (
              <>
                <AppCard backgroundColor="#151021" borderColor="#31224f">
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <MetricCell
                      label="Updated"
                      value={new Date(depthChartData.generatedAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    />
                    <MetricCell
                      label="Roster"
                      value={`${depthChartData.rosterCount}/${depthChartData.rosterLimit}`}
                    />
                    <MetricCell
                      label="Assignments"
                      value={`${depthAssignedCount}/${depthTotalSlots}`}
                    />
                    <MetricCell
                      label="Valued"
                      value={String(depthValuedCount)}
                      highlight={depthValuedCount > 0}
                    />
                    <MetricCell
                      label="Catalog-only"
                      value={String(Math.max(0, depthAssignedCount - depthValuedCount))}
                    />
                    <MetricCell
                      label="Manual review"
                      value={String(depthChartData.manualReview.length)}
                    />
                  </View>

                  <Text
                    style={{
                      color: depthChartData.constraints.rosterLimitRespected ? "#86efac" : "#fca5a5",
                      marginTop: 4,
                      fontWeight: "800",
                    }}
                  >
                    {depthChartData.constraints.note}
                  </Text>
                </AppCard>

                {DEPTH_POSITIONS.map((position) => {
                  const rows = depthChartData.positions[position] ?? [];
                  const q = depthChartSearch.trim().toLowerCase();
                  const visibleRanks = [1, 2, 3].filter((rank) => {
                    if (!q) return true;

                    const row = rows.find((item) => item.rank === rank);
                    if (!row) return false;

                    return (
                      row.playerName.toLowerCase().includes(q) ||
                      row.primaryPosition.toLowerCase().includes(q) ||
                      row.status.toLowerCase().includes(q)
                    );
                  });

                  if (visibleRanks.length === 0) {
                    return null;
                  }

                  return (
                    <AppCard
                      key={position}
                      backgroundColor="#151021"
                      borderColor="#31224f"
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <PositionBadge label={position} style={{ marginRight: 9, marginBottom: 0 }} />
                          <Text
                            style={{
                              color: "#f9fafb",
                              fontSize: 17,
                              fontWeight: "900",
                            }}
                          >
                            {position === "SP"
                              ? "Starting Pitcher"
                              : position === "RP"
                                ? "Relief Pitcher"
                                : position === "1B"
                                  ? "First Base"
                                  : position === "2B"
                                    ? "Second Base"
                                    : position === "3B"
                                      ? "Third Base"
                                      : position === "SS"
                                        ? "Shortstop"
                                        : position === "LF"
                                          ? "Left Field"
                                          : position === "CF"
                                            ? "Center Field"
                                            : position === "RF"
                                              ? "Right Field"
                                              : position === "DH"
                                                ? "Designated Hitter"
                                                : "Catcher"}
                          </Text>
                        </View>
                        <Text style={{ color: "#a78bfa", fontWeight: "900" }}>
                          {rows.length}/3
                        </Text>
                      </View>

                      {visibleRanks.map((rank, index) => {
                        const row = rows.find((item) => item.rank === rank);

                        if (!row) {
                          return (
                            <View
                              key={`${position}-${rank}`}
                              style={{
                                paddingVertical: 12,
                                borderTopWidth: index === 0 ? 0 : 1,
                                borderTopColor: "#33294a",
                              }}
                            >
                              <Text style={{ color: "#a78bfa", fontWeight: "900" }}>
                                #{rank}
                              </Text>
                              <Text style={{ color: "#a1a1aa", marginTop: 4 }}>No assignment</Text>
                            </View>
                          );
                        }

                        const matchedPlayer =
                          allPlayers.find(
                            (player) =>
                              player.mlbId === row.playerId ||
                              player.id === String(row.playerId),
                          ) ?? null;

                        const engineRow = matchedPlayer
                          ? valuationsByPlayerId.get(matchedPlayer.id)
                          : undefined;
                        const value = matchedPlayer
                          ? getAuctionValue(matchedPlayer, engineRow)
                          : null;
                        const isSaved = matchedPlayer
                          ? isInWatchlist(leagueId, matchedPlayer.id)
                          : false;
                        const imageUrl = matchedPlayer ? getPlayerImageUrl(matchedPlayer) : null;
                        const rowTone = matchedPlayer && value !== null && value > 0
                          ? "VALUE"
                          : matchedPlayer
                            ? "CATALOG"
                            : "DEPTH";

                        return (
                          <View
                            key={`${position}-${rank}`}
                            style={{
                              paddingVertical: 12,
                              borderTopWidth: index === 0 ? 0 : 1,
                              borderTopColor: "#33294a",
                            }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Text
                                style={{
                                  color: "#c4b5fd",
                                  fontWeight: "900",
                                  width: 34,
                                }}
                              >
                                #{rank}
                              </Text>

                              <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => void handleDepthPlayerPress(row, position)}
                                style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                              >
                                {imageUrl ? (
                                  <Image
                                    source={{ uri: imageUrl }}
                                    style={{
                                      width: 42,
                                      height: 42,
                                      borderRadius: 21,
                                      marginRight: 10,
                                      backgroundColor: "#272034",
                                      borderWidth: 1,
                                      borderColor: "#4c3575",
                                    }}
                                  />
                                ) : (
                                  <View
                                    style={{
                                      width: 42,
                                      height: 42,
                                      borderRadius: 21,
                                      marginRight: 10,
                                      backgroundColor: "#272034",
                                      borderWidth: 1,
                                      borderColor: "#4c3575",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <Text style={{ color: "#c4b5fd", fontWeight: "900" }}>
                                      {row.playerName.slice(0, 1)}
                                    </Text>
                                  </View>
                                )}

                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: "#f9fafb", fontWeight: "900" }}>
                                    {row.playerName}
                                  </Text>
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                      marginTop: 4,
                                    }}
                                  >
                                    <PositionBadge label={row.primaryPosition} small />
                                    <Text style={{ color: "#d1d5db", marginBottom: 5 }}>
                                      {row.status}
                                    </Text>
                                  </View>
                                  <Text style={{ color: "#a1a1aa", marginTop: 1, fontSize: 12 }}>
                                    {row.usageStarts} starts • {row.usageAppearances} apps
                                  </Text>
                                  {row.outOfPosition || row.needsManualReview ? (
                                    <Text style={{ color: "#fca5a5", marginTop: 4, fontWeight: "800", fontSize: 12 }}>
                                      Needs review
                                    </Text>
                                  ) : null}
                                </View>
                              </TouchableOpacity>

                              <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
                                <TouchableOpacity
                                  activeOpacity={0.82}
                                  onPress={() => void handleDepthStarToggle(row)}
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: isSaved ? "#facc15" : "#4c3575",
                                    backgroundColor: isSaved ? "#3a2c13" : "#151021",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginBottom: 5,
                                  }}
                                >
                                  <Text style={{ color: isSaved ? "#facc15" : "#8b7aa8", fontWeight: "900" }}>
                                    {isSaved ? "★" : "☆"}
                                  </Text>
                                </TouchableOpacity>

                                <Text style={{ color: value !== null && value > 0 ? "#4ade80" : "#a78bfa", fontSize: 10, fontWeight: "900" }}>
                                  {rowTone}
                                </Text>
                                <Text style={{ color: "#f9fafb", fontWeight: "900" }}>
                                  {value !== null && value > 0 ? formatMoney(value) : "—"}
                                </Text>
                              </View>
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
        statBasis={statBasis}
        engineRow={selectedEngineRow}
        note={selectedModalPlayer ? getNote(leagueId, selectedModalPlayer.id) : ""}
        onChangeNote={(note) => {
          if (selectedModalPlayer) {
            setNote(leagueId, selectedModalPlayer.id, note);
          }
        }}
        draftedByTeam={selectedDraftState?.teamName}
        draftedPrice={selectedDraftState?.paid}
        draftedContract={selectedDraftState?.contract}
        isDrafted={selectedDraftState?.isDrafted ?? false}
        depthChartContext={selectedDepthContext}
        onClose={() => {
          setSelectedModalPlayer(null);
          setSelectedDepthContext(null);
        }}
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
            setSelectedDepthContext(null);
          }
        }}
        onRemoveCustom={() => {
          if (selectedModalPlayer) {
            void removeCustomPlayer(selectedModalPlayer.id);
            setSelectedModalPlayer(null);
            setSelectedDepthContext(null);
          }
        }}
      />
    </SafeAreaView>
  );
}