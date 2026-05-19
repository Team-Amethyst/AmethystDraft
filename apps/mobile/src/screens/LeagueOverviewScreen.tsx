import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { getPlayers, getPlayersCached } from "../api/players";
import {
  getRoster,
  getRosterCached,
  removeRosterEntry,
  updateRosterEntry,
  type RosterEntry,
} from "../api/roster";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import PositionBadge from "../components/ui/PositionBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { LeagueTabParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { Player } from "../types/player";
import { normalizePlayerPositions, slotAllowsPosition } from "../utils/eligibility";

type Props = BottomTabScreenProps<LeagueTabParamList, "Overview">;

type SlotRow = {
  position: string;
  playerName: string | null;
  playerTeam: string | null;
  price: number | null;
  isKeeper: boolean;
};

type ReserveRow = {
  playerName: string;
  playerTeam: string | null;
  rosterSlot: string;
};

type TeamCardData = {
  teamId: string;
  teamName: string;
  slots: SlotRow[];
  rosterFilled: number;
  rosterTotal: number;
  budgetRemaining: number;
  bidAvg: number;
  maxBid: number;
  minors: ReserveRow[];
  taxi: ReserveRow[];
  otherReserves: ReserveRow[];
};

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

type StandingCategory = ScoringCategory & {
  key: string;
  label: string;
};

type StandingRow = {
  teamName: string;
  stats: Record<string, number>;
};

type RotoSummary = {
  totalPoints: number;
  overallRank: number;
};

type RankMap = Record<string, Map<string, number>>;

const ROSTER_SLOT_PICK_ORDER = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "CI",
  "OF",
  "SP",
  "RP",
  "P",
  "UTIL",
  "BN",
] as const;

const FALLBACK_CATS: ScoringCategory[] = [
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
  { name: "W", type: "pitching" },
  { name: "SV", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
];

const LOWER_IS_BETTER = new Set(["ERA", "WHIP"]);
const ROTO_RATE_BATTING_CATEGORIES = new Set(["AVG", "OBP", "SLG"]);
const ROTO_POINTS_SORT_KEY = "__roto_pts__";

function teamIdFromIndex(index: number): string {
  return `team_${index + 1}`;
}

function teamNameFromId(teamId: string, teamNames: string[]): string {
  const index = Number.parseInt(teamId.replace("team_", ""), 10) - 1;

  if (index >= 0 && index < teamNames.length) {
    return teamNames[index] ?? teamId;
  }

  return teamId;
}

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  if (teamNames && teamNames.length > 0) {
    const names = teamNames.slice(0, teams);

    while (names.length < teams) {
      names.push(`Team ${names.length + 1}`);
    }

    return names;
  }

  return Array.from({ length: teams }, (_, index) => `Team ${index + 1}`);
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${Math.round(value)}`;
}

function formatMlbTeam(team: string | null | undefined): string | null {
  if (!team) return null;
  return team.trim().toUpperCase();
}

function normalizeCatName(name: string): string {
  const upper = name.trim().toUpperCase();
  const inParens = upper.match(/\(([^)]+)\)$/)?.[1];
  const base = inParens ?? upper;

  if (base === "RUNS") return "R";
  if (base === "HOME RUNS") return "HR";
  if (base === "RUNS BATTED IN") return "RBI";
  if (base === "STOLEN BASES") return "SB";
  if (base === "BATTING AVERAGE") return "AVG";
  if (base === "ON-BASE PERCENTAGE") return "OBP";
  if (base === "SLUGGING PERCENTAGE") return "SLG";
  if (base === "TOTAL BASES") return "TB";
  if (base === "HITS") return "H";
  if (base === "WALKS") return "BB";
  if (base === "WINS") return "W";
  if (base === "STRIKEOUTS") return "K";
  if (base === "EARNED RUN AVERAGE") return "ERA";
  if (base === "WALKS + HITS PER IP") return "WHIP";
  if (base === "SAVES") return "SV";
  if (base === "HOLDS") return "HLD";
  if (base === "INNINGS PITCHED") return "IP";
  if (base === "COMPLETE GAMES") return "CG";

  return base;
}

function standingCategoryKey(cat: ScoringCategory, index: number): string {
  return `${cat.type}:${normalizeCatName(cat.name)}:${index}`;
}

function makeStandingCategories(scoringCats: ScoringCategory[]): StandingCategory[] {
  return scoringCats.map((cat, index) => {
    const label = normalizeCatName(cat.name);

    return {
      ...cat,
      name: label,
      label,
      key: standingCategoryKey(cat, index),
    };
  });
}

function normalizeRosterSlot(slot: string): string {
  return slot.trim().toUpperCase();
}

function orderedSlotKeys(rosterSlots: Record<string, number>): string[] {
  const keys = Object.keys(rosterSlots);
  const preferred = ROSTER_SLOT_PICK_ORDER.filter((key) => keys.includes(key));
  const preferredSet = new Set<string>(preferred);
  const rest = keys.filter((key) => !preferredSet.has(key));

  return [...preferred, ...rest];
}

function isReserveRosterSlot(rosterSlot: string | undefined | null): boolean {
  const slot = normalizeRosterSlot(rosterSlot ?? "");
  return slot.includes("MIN") || slot.includes("TAXI");
}

function isReserveEntry(entry: RosterEntry): boolean {
  return isReserveRosterSlot(entry.rosterSlot);
}

function isActiveAuctionEntry(entry: RosterEntry): boolean {
  return !isReserveEntry(entry);
}

function isDraftAuctionEntry(entry: RosterEntry): boolean {
  return isActiveAuctionEntry(entry) && !entry.isKeeper;
}

function isMinorsReserveEntry(entry: RosterEntry): boolean {
  return normalizeRosterSlot(entry.rosterSlot).includes("MIN");
}

function isTaxiReserveEntry(entry: RosterEntry): boolean {
  const slot = normalizeRosterSlot(entry.rosterSlot);
  return slot.includes("TAXI") && !slot.includes("MIN");
}

function sortDraftLog(entries: RosterEntry[]): RosterEntry[] {
  return [...entries].sort((a, b) => {
    const at = new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime();
    const bt = new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime();

    return at - bt;
  });
}

function assignTeamEntriesToRosterRows(
  rosterSlots: Record<string, number>,
  teamEntries: RosterEntry[],
): Array<{ position: string; entry: RosterEntry | null }> {
  const rows: Array<{ position: string; entry: RosterEntry | null }> = [];

  for (const position of orderedSlotKeys(rosterSlots)) {
    const count = rosterSlots[position] ?? 0;

    for (let i = 0; i < count; i += 1) {
      rows.push({ position, entry: null });
    }
  }

  const sorted = [...teamEntries].sort(
    (a, b) =>
      new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
      new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
  );

  for (const entry of sorted) {
    const positions = normalizePlayerPositions(entry.positions, entry.rosterSlot);

    if (positions.length === 0) {
      continue;
    }

    for (const row of rows) {
      if (row.entry) {
        continue;
      }

      if (!positions.some((position) => slotAllowsPosition(row.position, position))) {
        continue;
      }

      row.entry = entry;
      break;
    }
  }

  return rows;
}

function countAssignedRosterRows(rows: Array<{ entry: RosterEntry | null }>): number {
  return rows.filter((row) => row.entry !== null).length;
}

function reserveRow(entry: RosterEntry): ReserveRow {
  return {
    playerName: entry.playerName,
    playerTeam: formatMlbTeam(entry.playerTeam),
    rosterSlot: entry.rosterSlot,
  };
}

function buildTeamCardData(
  teamIndex: number,
  teamName: string,
  rosterSlots: Record<string, number>,
  entries: RosterEntry[],
  budget: number,
): TeamCardData {
  const teamId = teamIdFromIndex(teamIndex);
  const teamEntries = entries.filter((entry) => entry.teamId === teamId);
  const activeEntries = teamEntries.filter(isActiveAuctionEntry);
  const reserveEntries = teamEntries.filter(isReserveEntry);
  const assigned = assignTeamEntriesToRosterRows(rosterSlots, activeEntries);

  const slots = assigned.map((row) => ({
    position: row.position,
    playerName: row.entry?.playerName ?? null,
    playerTeam: formatMlbTeam(row.entry?.playerTeam),
    price: row.entry?.price ?? null,
    isKeeper: row.entry?.isKeeper ?? false,
  }));

  const rosterFilled = countAssignedRosterRows(assigned);
  const rosterTotal = slots.length;
  const spent = activeEntries.reduce((sum, entry) => sum + entry.price, 0);
  const budgetRemaining = Math.max(0, budget - spent);
  const open = Math.max(0, rosterTotal - rosterFilled);

  const minors = reserveEntries.filter(isMinorsReserveEntry).map(reserveRow);
  const taxi = reserveEntries.filter(isTaxiReserveEntry).map(reserveRow);
  const otherReserves = reserveEntries
    .filter((entry) => !isMinorsReserveEntry(entry) && !isTaxiReserveEntry(entry))
    .map(reserveRow);

  return {
    teamId,
    teamName,
    slots,
    rosterFilled,
    rosterTotal,
    budgetRemaining,
    bidAvg: open > 0 ? Math.round(budgetRemaining / open) : 0,
    maxBid: open > 0 ? Math.max(1, budgetRemaining - (open - 1)) : 0,
    minors,
    taxi,
    otherReserves,
  };
}

function buildPlayerMapForStandings(players: Player[]): Map<string, Player> {
  const map = new Map<string, Player>();

  for (const player of players) {
    map.set(player.id, player);
  }

  return map;
}

function numberFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function getProjStat(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const n = normalizeCatName(catName).trim().toUpperCase();

  if (catType === "batting") {
    const b = player.projection?.batting ?? player.stats?.batting;

    if (!b) return 0;

    const battingStats = player.stats?.batting as Record<string, unknown> | undefined;

    if (n === "HR") return numberFromUnknown(b.hr);
    if (n === "RBI") return numberFromUnknown(b.rbi);
    if (n === "R" || n === "RUNS") return numberFromUnknown(b.runs);
    if (n === "SB") return numberFromUnknown(b.sb);
    if (n === "AVG") return numberFromUnknown(b.avg);
    if (n === "OBP") return numberFromUnknown(battingStats?.obp);
    if (n === "SLG") return numberFromUnknown(battingStats?.slg);

    return 0;
  }

  const p = player.projection?.pitching ?? player.stats?.pitching;

  if (!p) return 0;

  if (n === "W" || n === "WINS") return numberFromUnknown(p.wins);
  if (n === "K" || n === "SO") return numberFromUnknown(p.strikeouts);
  if (n === "ERA") return numberFromUnknown(p.era);
  if (
    n === "WHIP" ||
    n === "WALKS + HITS PER IP" ||
    n === "W+H/IP" ||
    (n.includes("WHIP") && n.includes("IP"))
  ) {
    return numberFromUnknown(p.whip);
  }
  if (n === "SV" || n === "SAVES") return numberFromUnknown(p.saves);

  return 0;
}

function battingHitsAbFromPlayer(player: Player): { h: number; ab: number } | null {
  const projection = player.projection?.batting as
    | { h?: number; hits?: number; ab?: number; avg?: string | number }
    | undefined;
  const stats = player.stats?.batting as
    | { h?: number; hits?: number; ab?: number; avg?: string | number }
    | undefined;
  const spring = player.springStats?.batting as
    | { ab?: number; avg?: string | number }
    | undefined;
  const ab = Math.max(0, projection?.ab ?? stats?.ab ?? spring?.ab ?? 0);
  const explicitHits = projection?.hits ?? projection?.h ?? stats?.hits ?? stats?.h;

  if (ab > 0 && explicitHits !== undefined && Number.isFinite(Number(explicitHits))) {
    return { h: Number(explicitHits), ab };
  }

  const avg = numberFromUnknown(projection?.avg ?? stats?.avg);

  if (ab > 0 && Number.isFinite(avg) && avg > 0 && avg <= 1) {
    return { h: avg * ab, ab };
  }

  return null;
}

function teamBattingRatePaceForCategory(players: Player[], catName: string): number {
  const n = normalizeCatName(catName).trim().toUpperCase();

  if (n === "AVG") {
    let hits = 0;
    let atBats = 0;

    for (const player of players) {
      const chunk = battingHitsAbFromPlayer(player);

      if (chunk) {
        hits += chunk.h;
        atBats += chunk.ab;
      }
    }

    if (atBats > 0) {
      return hits / atBats;
    }
  }

  const batters = players.filter(
    (player) => Boolean(player.projection?.batting ?? player.stats?.batting),
  );
  const weights = batters.map((player) => {
    const batting = player.projection?.batting ?? player.stats?.batting;
    return numberFromUnknown(batting?.hr) + 1;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const weighted = batters.reduce(
    (sum, player, index) =>
      sum + getProjStat(player, catName, "batting") * (weights[index] ?? 0),
    0,
  );

  return weighted / totalWeight;
}

function teamPitchingRatePaceForCategory(players: Player[], catName: string): number {
  const pitchers = players.filter(
    (player) => Boolean(player.projection?.pitching ?? player.stats?.pitching),
  );

  let weightedSum = 0;
  let totalIp = 0;

  for (const player of pitchers) {
    const rate = getProjStat(player, catName, "pitching");
    const ip =
      numberFromUnknown(player.projection?.pitching?.innings) ||
      numberFromUnknown(player.stats?.pitching?.innings);

    if (ip > 0 && Number.isFinite(rate)) {
      weightedSum += rate * ip;
      totalIp += ip;
    }
  }

  if (totalIp > 0) {
    return weightedSum / totalIp;
  }

  const values = pitchers
    .map((player) => getProjStat(player, catName, "pitching"))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function buildProjectedStandings(
  teamNames: string[],
  entries: RosterEntry[],
  playerMap: Map<string, Player>,
  standingCategories: StandingCategory[],
): StandingRow[] {
  return teamNames.map((teamName, index) => {
    const teamId = teamIdFromIndex(index);
    const teamPlayers = entries
      .filter((entry) => entry.teamId === teamId)
      .map((entry) => playerMap.get(entry.externalPlayerId))
      .filter((player): player is Player => Boolean(player));

    const stats: Record<string, number> = {};

    for (const cat of standingCategories) {
      const normalized = normalizeCatName(cat.name).trim().toUpperCase();

      if (cat.type === "batting" && ROTO_RATE_BATTING_CATEGORIES.has(normalized)) {
        stats[cat.key] = teamBattingRatePaceForCategory(teamPlayers, cat.name);
      } else if (cat.type === "pitching" && LOWER_IS_BETTER.has(normalized)) {
        stats[cat.key] = teamPitchingRatePaceForCategory(teamPlayers, cat.name);
      } else {
        stats[cat.key] = teamPlayers.reduce(
          (sum, player) => sum + getProjStat(player, cat.name, cat.type),
          0,
        );
      }
    }

    return { teamName, stats };
  });
}

function isStatCellEmpty(value: number): boolean {
  return value === 0;
}

function formatStatCell(catName: string, value: number): string {
  if (value === 0) return "—";

  const n = normalizeCatName(catName).trim().toUpperCase();

  if (n === "AVG" || n === "OBP" || n === "SLG") return value.toFixed(3);
  if (n === "ERA" || n === "WHIP") return value.toFixed(2);

  return String(Math.round(value));
}

function computeRanks(rows: StandingRow[], catKey: string): Map<string, number> {
  const normalized = catKey.split(":")[1] ?? catKey;
  const isLower = LOWER_IS_BETTER.has(normalizeCatName(normalized).trim().toUpperCase());
  const sorted = [...rows].sort((a, b) => {
    const av = a.stats[catKey] ?? 0;
    const bv = b.stats[catKey] ?? 0;

    if (isLower) {
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return av - bv;
    }

    return bv - av;
  });
  const ranks = new Map<string, number>();

  sorted.forEach((row, index) => {
    ranks.set(row.teamName, index + 1);
  });

  return ranks;
}

function rotoPointsForRank(rank: number, teamCount: number): number {
  if (!Number.isFinite(rank) || rank < 1) {
    return 1;
  }

  return Math.max(1, teamCount - rank + 1);
}

function totalRotoPointsForTeam(
  teamName: string,
  standingCategories: StandingCategory[],
  rankMaps: RankMap,
  teamCount: number,
): number {
  let total = 0;

  for (const cat of standingCategories) {
    const rank = rankMaps[cat.label]?.get(teamName);

    if (rank !== undefined) {
      total += rotoPointsForRank(rank, teamCount);
    }
  }

  return total;
}

function computeTeamRotoSummaries(
  teamNames: string[],
  standingCategories: StandingCategory[],
  rankMaps: RankMap,
): Map<string, RotoSummary> {
  const teamCount = Math.max(teamNames.length, 1);
  const pointsByTeam = new Map<string, number>();

  for (const teamName of teamNames) {
    pointsByTeam.set(
      teamName,
      totalRotoPointsForTeam(teamName, standingCategories, rankMaps, teamCount),
    );
  }

  const sorted = [...teamNames].sort(
    (a, b) => (pointsByTeam.get(b) ?? 0) - (pointsByTeam.get(a) ?? 0),
  );
  const summaries = new Map<string, RotoSummary>();

  sorted.forEach((teamName, index) => {
    summaries.set(teamName, {
      totalPoints: pointsByTeam.get(teamName) ?? 0,
      overallRank: index + 1,
    });
  });

  return summaries;
}

function compareStandingRows(
  a: StandingRow,
  b: StandingRow,
  sortKey: string,
  sortAsc: boolean,
  summaries: Map<string, RotoSummary>,
): number {
  if (sortKey === ROTO_POINTS_SORT_KEY) {
    const diff =
      (summaries.get(b.teamName)?.totalPoints ?? 0) -
      (summaries.get(a.teamName)?.totalPoints ?? 0);

    return sortAsc ? -diff : diff;
  }

  const diff = (a.stats[sortKey] ?? 0) - (b.stats[sortKey] ?? 0);
  const statName = sortKey.split(":")[1] ?? sortKey;
  const isLower = LOWER_IS_BETTER.has(normalizeCatName(statName).trim().toUpperCase());
  const ranked = isLower ? diff : -diff;

  return sortAsc ? -ranked : ranked;
}

function rankColor(rank: number, total: number): string {
  const pct = rank / Math.max(total, 1);

  if (pct <= 0.33) return colors.green;
  if (pct <= 0.66) return colors.gold;
  return "#fb7185";
}


function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeRosterSlot(value);

    if (!normalized) continue;
    if (!result.includes(normalized)) result.push(normalized);
  }

  return result;
}

function isUniversalRosterSlot(slot: string): boolean {
  const normalized = normalizeRosterSlot(slot);
  return normalized === "BN" || normalized === "UTIL";
}

function rosterSlotOptionsForEntry(
  entry: RosterEntry | null,
  rosterSlots: Record<string, number>,
): string[] {
  if (!entry) return orderedSlotKeys(rosterSlots);

  const activeSlots = orderedSlotKeys(rosterSlots).filter(
    (slot) => !isReserveRosterSlot(slot),
  );
  const playerPositions = normalizePlayerPositions(
    entry.positions,
    entry.rosterSlot,
  );

  const eligibleSlots = activeSlots.filter((slot) => {
    if (isUniversalRosterSlot(slot)) return true;

    return playerPositions.some((position) =>
      slotAllowsPosition(slot, position),
    );
  });

  return uniqueStrings([entry.rosterSlot, ...eligibleSlots]);
}

function entryPlayerImage(entry: RosterEntry | null, playerMap: Map<string, Player>): string {
  if (!entry) return "";
  return playerMap.get(entry.externalPlayerId)?.headshot?.trim() ?? "";
}

function displayContract(entry: RosterEntry | null): string {
  return entry?.keeperContract?.trim() || "Arb / 3Y";
}

function modalBackdropStyle() {
  return {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center" as const,
    padding: 18,
  };
}

function modalCardStyle() {
  return {
    maxHeight: "86%" as const,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    overflow: "hidden" as const,
  };
}

function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        padding: 16,
        flexDirection: "row",
        alignItems: "flex-start",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
          {title}
        </Text>

        {subtitle ? (
          <Text style={{ color: colors.muted, marginTop: 4 }}>{subtitle}</Text>
        ) : null}
      </View>

      <TouchableOpacity activeOpacity={0.8} onPress={onClose}>
        <Text style={{ color: colors.muted, fontSize: 22, fontWeight: "700" }}>
          ×
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ReserveColumn({
  title,
  rows,
}: {
  title: string;
  rows: ReserveRow[];
}) {
  return (
    <View style={{ flex: 1, minWidth: 130, marginRight: 12 }}>
      <Text
        style={{
          color: colors.purple2,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1.4,
          marginBottom: 10,
        }}
      >
        {title} ({rows.length})
      </Text>

      {rows.length === 0 ? (
        <Text style={{ color: colors.muted }}>—</Text>
      ) : (
        rows.map((row, index) => (
          <View
            key={`${title}-${row.playerName}-${row.playerTeam ?? "FA"}-${index}`}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.text, flex: 1, marginRight: 8 }}
            >
              {row.playerName}
            </Text>

            {row.playerTeam ? (
              <Text style={{ color: colors.muted, fontWeight: "800" }}>
                {row.playerTeam}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function TeamReservesModal({
  team,
  onClose,
}: {
  team: TeamCardData | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={team !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalBackdropStyle()}>
        <View style={modalCardStyle()}>
          <ModalHeader
            title={team?.teamName ?? "Team"}
            subtitle={
              team
                ? `Reserves: ${team.minors.length} minors · ${team.taxi.length} taxi`
                : undefined
            }
            onClose={onClose}
          />

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <ReserveColumn title="MINORS" rows={team?.minors ?? []} />
              <ReserveColumn title="TAXI" rows={team?.taxi ?? []} />

              {team && team.otherReserves.length > 0 ? (
                <ReserveColumn title="RESERVES" rows={team.otherReserves} />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OptionPill({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? colors.purple2 : colors.border,
        backgroundColor: selected ? colors.purple : colors.surface2,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginRight: 8,
        marginBottom: 8,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: selected ? colors.white : colors.text,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function EditPickModal({
  entry,
  teamNames,
  editTeamId,
  editSlot,
  editPrice,
  slotOptions,
  playerImage,
  saving,
  onChangeTeamId,
  onChangeSlot,
  onChangePrice,
  onCancel,
  onSave,
}: {
  entry: RosterEntry | null;
  teamNames: string[];
  editTeamId: string;
  editSlot: string;
  editPrice: string;
  slotOptions: string[];
  playerImage: string;
  saving: boolean;
  onChangeTeamId: (value: string) => void;
  onChangeSlot: (value: string) => void;
  onChangePrice: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      visible={entry !== null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={modalBackdropStyle()}>
        <View style={modalCardStyle()}>
          <ModalHeader title="EDIT PICK" onClose={onCancel} />

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingBottom: 14,
                marginBottom: 16,
              }}
            >
              {playerImage ? (
                <Image
                  source={{ uri: playerImage }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    marginRight: 12,
                    backgroundColor: colors.surface2,
                  }}
                />
              ) : null}

              <Text
                style={{
                  color: colors.text,
                  fontSize: 17,
                  fontWeight: "900",
                  flex: 1,
                }}
              >
                {entry?.playerName ?? "Player"}
              </Text>
            </View>

            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.1,
                marginBottom: 8,
              }}
            >
              TEAM
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
            >
              {teamNames.map((teamName, index) => {
                const teamId = teamIdFromIndex(index);

                return (
                  <OptionPill
                    key={teamId}
                    label={teamName}
                    selected={editTeamId === teamId}
                    onPress={() => onChangeTeamId(teamId)}
                  />
                );
              })}
            </ScrollView>

            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.1,
                marginBottom: 8,
              }}
            >
              ROSTER SLOT
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
            >
              {slotOptions.map((slot) => (
                <OptionPill
                  key={slot}
                  label={slot}
                  selected={editSlot === slot}
                  onPress={() => onChangeSlot(slot)}
                />
              ))}
            </ScrollView>

            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.1,
                marginBottom: 8,
              }}
            >
              PRICE PAID
            </Text>

            <TextInput
              value={editPrice}
              onChangeText={onChangePrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={{
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface2,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 14,
                fontWeight: "800",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 12,
                marginBottom: 18,
              }}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  fontWeight: "900",
                  letterSpacing: 1.1,
                }}
              >
                CONTRACT
              </Text>

              <Text style={{ color: colors.green, fontWeight: "900" }}>
                {displayContract(entry)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <DraftButton label="Cancel" onPress={onCancel} />
              <DraftButton
                label={saving ? "Saving..." : "Save"}
                onPress={onSave}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TeamStatPill({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 72,
        backgroundColor: "#241638",
        borderColor: "#3d2864",
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 8,
        marginRight: 6,
      }}
    >
      <Text
        style={{
          color: colors.muted,
          fontSize: 10,
          fontWeight: "900",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: 16,
          fontWeight: "900",
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function FilledSlotRow({ slot }: { slot: SlotRow }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: "#261a3c",
      }}
    >
      <PositionBadge label={slot.position} />

      <Text
        numberOfLines={1}
        style={{
          color: slot.playerName ? colors.text : colors.muted,
          flex: 1,
          fontWeight: slot.playerName ? "800" : "600",
        }}
      >
        {slot.playerName
          ? `${slot.playerName}${slot.playerTeam ? ` · ${slot.playerTeam}` : ""}`
          : "— empty —"}
      </Text>

      {slot.price !== null && slot.price > 0 ? (
        <Text style={{ color: colors.gold, marginLeft: 6, fontWeight: "900" }}>
          {formatMoney(slot.price)}
        </Text>
      ) : null}
    </View>
  );
}

function ReserveSummary({
  minors,
  taxi,
  otherReserves,
  onViewReserves,
}: {
  minors: ReserveRow[];
  taxi: ReserveRow[];
  otherReserves: ReserveRow[];
  onViewReserves: () => void;
}) {
  const totalReserves = minors.length + taxi.length + otherReserves.length;

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: colors.muted }}>
        Minors {minors.length} · Taxi {taxi.length}
        {otherReserves.length > 0 ? ` · Reserves ${otherReserves.length}` : ""}
      </Text>

      {totalReserves > 0 ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onViewReserves}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingVertical: 9,
            alignItems: "center",
            marginTop: 10,
            backgroundColor: "#241638",
          }}
        >
          <Text
            style={{
              color: colors.purple2,
              fontSize: 12,
              fontWeight: "900",
              letterSpacing: 0.4,
            }}
          >
            VIEW RESERVES
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function DraftButton({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        backgroundColor: danger ? "#3a1420" : "#321d4f",
        borderColor: danger ? "#7f1d1d" : "#6d3fb8",
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 8,
      }}
    >
      <Text
        style={{
          color: danger ? "#fecaca" : "#f5eaff",
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function LeagueOverviewScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const teamNames = useMemo(() => {
    if (!league) return [];
    return safeTeamNames(league.teams, league.teamNames);
  }, [league]);

  const [entries, setEntries] = useState<RosterEntry[]>(
    () => getRosterCached(leagueId) ?? [],
  );
  const [allPlayers, setAllPlayers] = useState<Player[]>(
    () =>
      getPlayersCached(
        "value",
        league?.posEligibilityThreshold,
        league?.playerPool,
      ) ?? [],
  );
  const [sortCat, setSortCat] = useState(ROTO_POINTS_SORT_KEY);
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(() => getRosterCached(leagueId) === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reserveModalTeam, setReserveModalTeam] = useState<TeamCardData | null>(null);
  const [editingEntry, setEditingEntry] = useState<RosterEntry | null>(null);
  const [editTeamId, setEditTeamId] = useState("");
  const [editSlot, setEditSlot] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadOverview = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!token || !league) return;

      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const cachedRoster = getRosterCached(league.id);
      if (cachedRoster) setEntries(cachedRoster);

      const cachedPlayers = getPlayersCached(
        "value",
        league.posEligibilityThreshold,
        league.playerPool,
      );
      if (cachedPlayers) setAllPlayers(cachedPlayers);

      try {
        const [roster, players] = await Promise.all([
          getRoster(league.id, token),
          getPlayers("value", league.posEligibilityThreshold, league.playerPool),
        ]);

        setEntries(roster);
        setAllPlayers(players);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load league overview.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [league, token],
  );

  useEffect(() => {
    void loadOverview("load");
  }, [loadOverview]);

  const activeEntries = useMemo(() => {
    return entries.filter(isActiveAuctionEntry);
  }, [entries]);

  const draftLog = useMemo(() => {
    return sortDraftLog(entries.filter(isDraftAuctionEntry));
  }, [entries]);

  const teamCards = useMemo(() => {
    if (!league) return [];

    return teamNames.map((teamName, index) =>
      buildTeamCardData(
        index,
        teamName,
        league.rosterSlots ?? {},
        entries,
        league.budget,
      ),
    );
  }, [league, teamNames, entries]);

  const totalActiveSpent = useMemo(() => {
    return activeEntries.reduce((sum, entry) => sum + entry.price, 0);
  }, [activeEntries]);

  const playerMap = useMemo(() => {
    return buildPlayerMapForStandings(allPlayers);
  }, [allPlayers]);

  const scoringCats = useMemo(() => {
    return (league?.scoringCategories?.length
      ? league.scoringCategories
      : FALLBACK_CATS
    ).map((cat) => ({
      name: normalizeCatName(cat.name),
      type: cat.type,
    }));
  }, [league]);

  const standingCategories = useMemo(() => {
    return makeStandingCategories(scoringCats);
  }, [scoringCats]);

  useEffect(() => {
    if (
      sortCat !== ROTO_POINTS_SORT_KEY &&
      !standingCategories.some((cat) => cat.key === sortCat)
    ) {
      setSortCat(ROTO_POINTS_SORT_KEY);
      setSortAsc(false);
    }
  }, [sortCat, standingCategories]);

  const standings = useMemo(() => {
    return buildProjectedStandings(
      teamNames,
      activeEntries,
      playerMap,
      standingCategories,
    );
  }, [teamNames, activeEntries, playerMap, standingCategories]);

  const uniqueRankMaps = useMemo(() => {
    return Object.fromEntries(
      standingCategories.map((cat) => [cat.key, computeRanks(standings, cat.key)]),
    );
  }, [standings, standingCategories]);

  const rotoRankMaps = useMemo(() => {
    return Object.fromEntries(
      standingCategories.map((cat) => [cat.label, computeRanks(standings, cat.key)]),
    );
  }, [standings, standingCategories]);

  const rotoSummaries = useMemo(() => {
    return computeTeamRotoSummaries(teamNames, standingCategories, rotoRankMaps);
  }, [teamNames, standingCategories, rotoRankMaps]);

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) =>
      compareStandingRows(a, b, sortCat, sortAsc, rotoSummaries),
    );
  }, [standings, sortCat, sortAsc, rotoSummaries]);

  const leagueActiveSlotTotal = useMemo(() => {
    if (!league) return 0;

    const perTeam = Object.values(league.rosterSlots ?? {}).reduce(
      (sum, value) => sum + value,
      0,
    );

    return perTeam * league.teams;
  }, [league]);

  const editSlotOptions = useMemo(() => {
    return rosterSlotOptionsForEntry(editingEntry, league?.rosterSlots ?? {});
  }, [editingEntry, league]);

  const editingPlayerImage = useMemo(() => {
    return entryPlayerImage(editingEntry, playerMap);
  }, [editingEntry, playerMap]);

  function toggleSort(cat: string) {
    if (cat === sortCat) {
      setSortAsc((value) => !value);
    } else {
      setSortCat(cat);
      setSortAsc(false);
    }
  }

  function handleRemoveEntry(entry: RosterEntry) {
    if (!token || !league) return;

    Alert.alert(
      "Remove player?",
      `Remove ${entry.playerName} from ${teamNameFromId(entry.teamId, teamNames)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeRosterEntry(league.id, entry._id, token);
              setEntries((current) =>
                current.filter((item) => item._id !== entry._id),
              );
            } catch (err) {
              Alert.alert(
                "Remove failed",
                err instanceof Error
                  ? err.message
                  : "Could not remove this player.",
              );
            }
          },
        },
      ],
    );
  }

  function startEditingEntry(entry: RosterEntry) {
    setEditingEntry(entry);
    setEditTeamId(entry.teamId);
    setEditSlot(normalizeRosterSlot(entry.rosterSlot));
    setEditPrice(String(Math.round(entry.price)));
  }

  function cancelEditingEntry() {
    setEditingEntry(null);
    setEditTeamId("");
    setEditSlot("");
    setEditPrice("");
    setSavingEdit(false);
  }

  async function handleSaveEditedEntry() {
    if (!token || !league || !editingEntry) return;

    const nextPrice = Number(editPrice);
    const nextSlot = normalizeRosterSlot(editSlot);
    const validTeamIds = new Set(teamNames.map((_, index) => teamIdFromIndex(index)));

    if (!validTeamIds.has(editTeamId)) {
      Alert.alert("Invalid team", "Choose a valid team.");
      return;
    }

    if (!nextSlot) {
      Alert.alert("Invalid roster slot", "Choose a valid roster slot.");
      return;
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      Alert.alert("Invalid price", "Enter a non-negative price.");
      return;
    }

    setSavingEdit(true);

    try {
      const updated = await updateRosterEntry(
        league.id,
        editingEntry._id,
        {
          teamId: editTeamId,
          rosterSlot: nextSlot,
          price: nextPrice,
          keeperContract: editingEntry.keeperContract,
        },
        token,
      );

      setEntries((current) =>
        current.map((item) => (item._id === updated._id ? updated : item)),
      );
      cancelEditingEntry();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update this pick.",
      );
      setSavingEdit(false);
    }
  }

  if (!league) {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadOverview("refresh")}
          />
        }
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: "900",
            color: colors.text,
            marginBottom: 4,
          }}
        >
          League Overview
        </Text>

        <Text style={{ color: colors.muted, marginBottom: 16 }}>
          Track team budgets, projected standings, rosters, and the full draft log.
        </Text>

        {error ? <ErrorState label={error} /> : null}

        {loading ? (
          <LoadingState label="Loading league overview..." />
        ) : (
          <>
            <AppCard>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "900",
                  marginBottom: 10,
                }}
              >
                League Summary
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Teams</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {league.teams}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Budget</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {formatMoney(league.budget)}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Active Filled</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {activeEntries.length}/{leagueActiveSlotTotal}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Rostered Players</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {entries.length}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Auction Picks</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {draftLog.length}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Active Spend</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {formatMoney(totalActiveSpent)}
                  </Text>
                </View>
              </View>
            </AppCard>

            <AppCard>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
                  Team Comparison
                </Text>
                <Text style={{ color: colors.muted, marginLeft: 8 }}>
                  {teamCards.length} teams · scroll horizontally
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {teamCards.map((team) => (
                  <View
                    key={team.teamId}
                    style={{
                      width: 278,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 16,
                      padding: 12,
                      marginRight: 12,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
                      {team.teamName}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 3, marginBottom: 10 }}>
                      {team.rosterFilled}/{team.rosterTotal} roster filled
                    </Text>

                    <View style={{ flexDirection: "row", marginBottom: 8 }}>
                      <TeamStatPill label="REMAINING" value={formatMoney(team.budgetRemaining)} />
                      <TeamStatPill label="BID AVG" value={formatMoney(team.bidAvg)} />
                      <TeamStatPill
                        label="MAX BID"
                        value={team.maxBid > 0 ? formatMoney(team.maxBid) : "—"}
                      />
                    </View>

                    <View style={{ marginTop: 4 }}>
                      {team.slots.map((slot, index) => (
                        <FilledSlotRow
                          key={`${team.teamId}-${slot.position}-${index}`}
                          slot={slot}
                        />
                      ))}
                    </View>

                    <ReserveSummary
                      minors={team.minors}
                      taxi={team.taxi}
                      otherReserves={team.otherReserves}
                      onViewReserves={() => setReserveModalTeam(team)}
                    />
                  </View>
                ))}
              </ScrollView>
            </AppCard>

            <AppCard>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "900",
                  marginBottom: 8,
                }}
              >
                Projected Standings
              </Text>

              <Text style={{ color: colors.muted, marginBottom: 10 }}>
                Pre-season projections. Sort by total roto points or by category.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {[
                  { key: ROTO_POINTS_SORT_KEY, label: "Pts" },
                  ...standingCategories.map((cat) => ({
                    key: cat.key,
                    label: cat.label,
                  })),
                ].map((cat) => (
                  <AppChip
                    key={cat.key}
                    label={`${cat.label}${
                      sortCat === cat.key ? (sortAsc ? " ↑" : " ↓") : ""
                    }`}
                    selected={sortCat === cat.key}
                    onPress={() => toggleSort(cat.key)}
                    style={{ marginRight: 8 }}
                  />
                ))}
              </ScrollView>

              {sortedStandings.map((row, index) => {
                const summary = rotoSummaries.get(row.teamName);
                const selectedCategory = standingCategories.find(
                  (cat) => cat.key === sortCat,
                );
                const sortValue =
                  sortCat === ROTO_POINTS_SORT_KEY
                    ? summary?.totalPoints ?? 0
                    : row.stats[sortCat] ?? 0;
                const sortRank =
                  sortCat === ROTO_POINTS_SORT_KEY
                    ? summary?.overallRank ?? index + 1
                    : uniqueRankMaps[sortCat]?.get(row.teamName) ?? index + 1;

                return (
                  <View
                    key={row.teamName}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                      paddingVertical: 11,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>
                      #{index + 1} {row.teamName}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 3 }}>
                      {sortCat === ROTO_POINTS_SORT_KEY
                        ? `Total roto points: ${summary?.totalPoints ?? 0}`
                        : `${selectedCategory?.label ?? sortCat}: ${formatStatCell(selectedCategory?.label ?? sortCat, sortValue)} · rank #${sortRank}`}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      {standingCategories.map((cat) => {
                        const value = row.stats[cat.key] ?? 0;
                        const rank = rotoRankMaps[cat.label]?.get(row.teamName) ?? teamNames.length;
                        const points = rotoPointsForRank(rank, teamNames.length);
                        const empty = isStatCellEmpty(value);

                        return (
                          <Text
                            key={cat.key}
                            style={{
                              width: "50%",
                              color: cat.key === sortCat ? colors.gold : colors.muted,
                              fontSize: 12,
                              marginBottom: 4,
                            }}
                          >
                            <Text style={{ fontWeight: "900" }}>{cat.label}</Text>{" "}
                            <Text
                              style={{
                                color: empty ? colors.muted : rankColor(rank, teamNames.length),
                              }}
                            >
                              {formatStatCell(cat.label, value)}
                            </Text>{" "}
                            · {points} pts
                          </Text>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </AppCard>

            <AppCard>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
                  Draft Log
                </Text>
                <Text style={{ color: colors.muted, marginLeft: 8 }}>
                  {draftLog.length} picks
                </Text>
              </View>

              {draftLog.length === 0 ? (
                <EmptyState label="No picks yet." />
              ) : (
                draftLog.map((entry, index) => (
                  <View
                    key={entry._id}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                      paddingVertical: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text
                        style={{
                          color: colors.muted,
                          width: 42,
                          fontWeight: "900",
                        }}
                      >
                        #{index + 1}
                      </Text>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "900" }}>
                          {entry.playerName}
                        </Text>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                            marginTop: 4,
                          }}
                        >
                          <Text style={{ color: colors.muted, marginRight: 4 }}>
                            {formatMlbTeam(entry.playerTeam) || "FA"} ·{" "}
                            {teamNameFromId(entry.teamId, teamNames)} ·
                          </Text>
                          <PositionBadge label={entry.rosterSlot} small />
                          <Text style={{ color: colors.muted }}>
                            {formatMoney(entry.price)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", marginTop: 8 }}>
                      <DraftButton
                        label="Edit"
                        onPress={() => startEditingEntry(entry)}
                      />
                      <DraftButton
                        label="Remove"
                        tone="danger"
                        onPress={() => handleRemoveEntry(entry)}
                      />
                    </View>
                  </View>
                ))
              )}
            </AppCard>
          </>
        )}
      </ScrollView>

      <TeamReservesModal
        team={reserveModalTeam}
        onClose={() => setReserveModalTeam(null)}
      />

      <EditPickModal
        entry={editingEntry}
        teamNames={teamNames}
        editTeamId={editTeamId}
        editSlot={editSlot}
        editPrice={editPrice}
        slotOptions={editSlotOptions}
        playerImage={editingPlayerImage}
        saving={savingEdit}
        onChangeTeamId={setEditTeamId}
        onChangeSlot={setEditSlot}
        onChangePrice={setEditPrice}
        onCancel={cancelEditingEntry}
        onSave={() => void handleSaveEditedEntry()}
      />
    </SafeAreaView>
  );
}
