import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import {
  getMockPick,
  getNewsSignals,
  getScarcity,
  getValuation,
  getValuationPlayer,
  type MockPickPrediction,
  type ScarcityResponse,
  type ValuationPlayerResponse,
  type ValuationResult,
} from "../api/engine";
import { getPlayers } from "../api/players";
import {
  addRosterEntry,
  getRoster,
  removeRosterEntry,
  updateRosterEntry,
  type RosterEntry,
  type RosterEntryPayload,
} from "../api/roster";
import BidDecisionCard from "../components/BidDecisionCard";
import {
  draftSetHasPlayer,
  resolvePlayerDraftState,
} from "../domain/draftState";
import { EmptyState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import { computeTeamData } from "../utils/commandCenterUtils";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";

type Props = BottomTabScreenProps<LeagueTabParamList, "CommandCenter">;

type CommandView =
  | "Auction"
  | "Market"
  | "Teams"
  | "Standings"
  | "Log";

type StatSide = "batting" | "pitching";

type ScoringCategory = {
  name: string;
  type?: "batting" | "pitching";
};

type TeamProjectionRow = {
  teamId: string;
  teamName: string;
  totalPoints: number;
  categoryValues: Record<string, number>;
  categoryPoints: Record<string, number>;
};

type UndoAction =
  | {
      kind: "add";
      entry: RosterEntry;
    }
  | {
      kind: "delete";
      entry: RosterEntry;
    }
  | {
      kind: "update";
      before: RosterEntry;
      after: RosterEntry;
    };

const COLORS = {
  page: "#070410",
  panel: "#120d1f",
  panel2: "#171027",
  panel3: "#1d1432",
  border: "#302147",
  borderStrong: "#4c3575",
  text: "#f8f5ff",
  muted: "#a996c8",
  dim: "#7c6a9e",
  purple: "#8b5cf6",
  purple2: "#a855f7",
  green: "#22c55e",
  red: "#fb7185",
  yellow: "#facc15",
  blue: "#60a5fa",
};

const LOWER_IS_BETTER = new Set(["ERA", "WHIP"]);

const FALLBACK_HITTING_CATS = ["R", "HR", "RBI", "SB", "AVG"];
const FALLBACK_PITCHING_CATS = ["W", "K", "ERA", "WHIP", "SV"];

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

function toNumber(value: unknown): number {
  return finiteNumber(value) ?? 0;
}

function money(value: number | null | undefined): string {
  const parsed = finiteNumber(value);

  if (parsed === null) {
    return "—";
  }

  return `$${Math.round(parsed)}`;
}

function signedMoney(value: number | null | undefined): string {
  const parsed = finiteNumber(value);

  if (parsed === null) {
    return "—";
  }

  const rounded = Math.round(parsed);

  if (rounded === 0) {
    return "$0";
  }

  return `${rounded > 0 ? "+" : "-"}$${Math.abs(rounded)}`;
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  const parsed = finiteNumber(value);

  if (parsed === null) {
    return "—";
  }

  if (Math.abs(parsed) < 1 && parsed !== 0) {
    return parsed.toFixed(3).replace(/^0/, "");
  }

  return parsed.toFixed(digits);
}

function normalizeCatName(raw: string): string {
  const upper = raw.trim().toUpperCase();
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
  if (base === "COMPLETE GAMES") return "CG";
  if (base === "INNINGS PITCHED") return "IP";

  return base;
}

function teamNameFromId(teamId: string, teamNames?: string[]): string {
  const index = Number.parseInt(teamId.replace("team_", ""), 10) - 1;

  if (Number.isFinite(index) && index >= 0) {
    return teamNames?.[index] ?? teamId;
  }

  return teamId;
}

function teamIdFromNumber(value: string): string {
  const teamNumber = Number(value);

  if (!Number.isFinite(teamNumber) || teamNumber <= 0) {
    return "team_1";
  }

  return `team_${Math.round(teamNumber)}`;
}

function teamNumberFromId(teamId: string): string {
  const teamNumber = Number.parseInt(teamId.replace("team_", ""), 10);

  if (!Number.isFinite(teamNumber) || teamNumber <= 0) {
    return "1";
  }

  return String(teamNumber);
}

function displayPositions(player: Player | null): string {
  if (!player) {
    return "—";
  }

  if (player.positions && player.positions.length > 0) {
    return player.positions.join(", ");
  }

  return player.position || "—";
}

function primaryPosition(player: Player | null): string | null {
  if (!player) {
    return null;
  }

  return player.positions?.[0] ?? player.position.split("/")[0]?.trim() ?? null;
}

function positionList(player: Player): string[] {
  const raw = [player.position, ...(player.positions ?? [])]
    .join("/")
    .split("/")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const result: string[] = [];

  for (const item of raw) {
    if (["LF", "CF", "RF"].includes(item)) {
      if (!result.includes("OF")) {
        result.push("OF");
      }
    } else if (!result.includes(item)) {
      result.push(item);
    }
  }

  return result;
}

function playerMatchesPosition(player: Player, position: string): boolean {
  const target = position.trim().toUpperCase();

  if (!target) {
    return true;
  }

  if (target === "OF") {
    return positionList(player).includes("OF");
  }

  return positionList(player).includes(target);
}

function playerSearchText(player: Player): string {
  return `${player.name} ${player.team} ${player.position} ${(player.positions ?? []).join(" ")}`.toLowerCase();
}

function playerRecord(player: Player): Record<string, unknown> {
  return player as unknown as Record<string, unknown>;
}

function valuationRecord(row: ValuationResult | null | undefined): Record<string, unknown> {
  return (row ?? {}) as unknown as Record<string, unknown>;
}

function valueFromValuation(row: ValuationResult | null | undefined, key: string): number | null {
  return finiteNumber(valuationRecord(row)[key]);
}

function valueFromPlayer(player: Player | null, key: string): number | null {
  if (!player) {
    return null;
  }

  return finiteNumber(playerRecord(player)[key]);
}

function getPlayerImageUrl(player: Player | null): string | null {
  if (!player) {
    return null;
  }

  const record = playerRecord(player);
  const direct =
    record.headshotUrl ??
    record.imageUrl ??
    record.photoUrl ??
    record.playerImageUrl ??
    record.headshot;

  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const mlbId =
    finiteNumber(record.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId);

  if (mlbId === null) {
    return null;
  }

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_128,q_auto:best/v1/people/${Math.round(
    mlbId,
  )}/headshot/67/current`;
}

function valuationForPlayer(
  player: Player | null,
  valuationSnapshot: ValuationPlayerResponse | null,
): ValuationResult | null {
  if (!player || !valuationSnapshot) {
    return null;
  }

  if (valuationSnapshot.player) {
    return valuationSnapshot.player;
  }

  const byId = valuationSnapshot.valuations.find((row) => row.player_id === player.id);

  if (byId) {
    return byId;
  }

  const byName = valuationSnapshot.valuations.find((row) => {
    const sameName = row.name.trim().toLowerCase() === player.name.trim().toLowerCase();
    const sameTeam =
      !row.team || row.team.trim().toLowerCase() === player.team.trim().toLowerCase();

    return sameName && sameTeam;
  });

  return byName ?? null;
}

function auctionValue(player: Player | null, row: ValuationResult | null): number | null {
  if (!player) {
    return null;
  }

  return (
    valueFromValuation(row, "auction_value") ??
    valueFromValuation(row, "baseline_value") ??
    valueFromPlayer(player, "auction_value") ??
    finiteNumber(player.value)
  );
}

function recommendedBid(player: Player | null, row: ValuationResult | null): number | null {
  if (!player) {
    return null;
  }

  return (
    valueFromValuation(row, "recommended_bid") ??
    valueFromValuation(row, "team_value") ??
    valueFromValuation(row, "auction_value") ??
    finiteNumber(player.value)
  );
}

function teamValue(player: Player | null, row: ValuationResult | null): number | null {
  if (!player) {
    return null;
  }

  return (
    valueFromValuation(row, "team_value") ??
    valueFromValuation(row, "auction_value") ??
    finiteNumber(player.value)
  );
}

function bidEdge(player: Player | null, row: ValuationResult | null): number | null {
  const explicit = valueFromValuation(row, "edge");

  if (explicit !== null) {
    return explicit;
  }

  const bid = recommendedBid(player, row);
  const value = teamValue(player, row);

  if (bid === null || value === null) {
    return null;
  }

  return value - bid;
}

function auctionRank(player: Player | null, row: ValuationResult | null): number | null {
  return (
    valueFromValuation(row, "auction_rank") ??
    valueFromPlayer(player, "auction_rank") ??
    valueFromPlayer(player, "catalog_rank")
  );
}

function marketAdp(player: Player | null, row: ValuationResult | null): number | null {
  return (
    valueFromValuation(row, "market_adp") ??
    valueFromPlayer(player, "market_adp") ??
    finiteNumber(player?.adp)
  );
}

function auctionTier(player: Player | null, row: ValuationResult | null): number | null {
  return (
    valueFromValuation(row, "auction_tier") ??
    valueFromValuation(row, "tier") ??
    valueFromPlayer(player, "auction_tier") ??
    finiteNumber(player?.tier)
  );
}

function getObjectNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const parsed = finiteNumber(record[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function getCategoryValue(player: Player, cat: string): number {
  const battingProj = player.projection?.batting as Record<string, unknown> | undefined;
  const battingStats = player.stats?.batting as Record<string, unknown> | undefined;
  const pitchingProj = player.projection?.pitching as Record<string, unknown> | undefined;
  const pitchingStats = player.stats?.pitching as Record<string, unknown> | undefined;

  switch (cat) {
    case "R":
      return toNumber(battingProj?.runs ?? battingStats?.runs);
    case "HR":
      return toNumber(battingProj?.hr ?? battingStats?.hr);
    case "RBI":
      return toNumber(battingProj?.rbi ?? battingStats?.rbi);
    case "SB":
      return toNumber(battingProj?.sb ?? battingStats?.sb);
    case "AVG":
      return toNumber(battingProj?.avg ?? battingStats?.avg);
    case "OBP":
      return toNumber(battingStats?.obp);
    case "SLG":
      return toNumber(battingStats?.slg);
    case "TB":
      return toNumber(battingStats?.tb);
    case "H":
      return toNumber(battingStats?.h ?? battingStats?.hits);
    case "BB":
      return toNumber(battingStats?.bb ?? battingStats?.walks);
    case "W":
      return toNumber(pitchingProj?.wins ?? pitchingStats?.wins);
    case "K":
      return toNumber(pitchingProj?.strikeouts ?? pitchingStats?.strikeouts);
    case "ERA":
      return toNumber(pitchingProj?.era ?? pitchingStats?.era);
    case "WHIP":
      return toNumber(pitchingProj?.whip ?? pitchingStats?.whip);
    case "SV":
      return toNumber(pitchingProj?.saves ?? pitchingStats?.saves);
    case "HLD":
      return toNumber(pitchingProj?.holds ?? pitchingStats?.holds);
    case "CG":
      return toNumber(pitchingProj?.completeGames ?? pitchingStats?.completeGames);
    case "IP":
      return toNumber(pitchingProj?.innings ?? pitchingStats?.innings);
    default:
      return 0;
  }
}

function getRatioValueAndWeight(
  player: Player,
  cat: string,
): { value: number; weight: number } | null {
  const battingProj = player.projection?.batting as Record<string, unknown> | undefined;
  const battingStats = player.stats?.batting as Record<string, unknown> | undefined;
  const pitchingProj = player.projection?.pitching as Record<string, unknown> | undefined;
  const pitchingStats = player.stats?.pitching as Record<string, unknown> | undefined;

  if (cat === "AVG") {
    const value =
      getObjectNumber(battingProj, ["avg", "AVG"]) ??
      getObjectNumber(battingStats, ["avg", "AVG"]);
    const weight =
      getObjectNumber(battingProj, ["ab", "atBats", "at_bats", "AB"]) ??
      getObjectNumber(battingStats, ["ab", "atBats", "at_bats", "AB"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "OBP") {
    const value =
      getObjectNumber(battingProj, ["obp", "OBP"]) ??
      getObjectNumber(battingStats, ["obp", "OBP"]);
    const weight =
      getObjectNumber(battingProj, ["pa", "plateAppearances", "plate_appearances"]) ??
      getObjectNumber(battingStats, ["pa", "plateAppearances", "plate_appearances"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "SLG") {
    const value =
      getObjectNumber(battingProj, ["slg", "SLG"]) ??
      getObjectNumber(battingStats, ["slg", "SLG"]);
    const weight =
      getObjectNumber(battingProj, ["ab", "atBats", "at_bats", "AB"]) ??
      getObjectNumber(battingStats, ["ab", "atBats", "at_bats", "AB"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "ERA") {
    const value =
      getObjectNumber(pitchingProj, ["era", "ERA"]) ??
      getObjectNumber(pitchingStats, ["era", "ERA"]);
    const weight =
      getObjectNumber(pitchingProj, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      getObjectNumber(pitchingStats, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "WHIP") {
    const value =
      getObjectNumber(pitchingProj, ["whip", "WHIP"]) ??
      getObjectNumber(pitchingStats, ["whip", "WHIP"]);
    const weight =
      getObjectNumber(pitchingProj, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      getObjectNumber(pitchingStats, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  return null;
}

function formatCategoryValue(cat: string, value: number): string {
  if (cat === "AVG" || cat === "OBP" || cat === "SLG") {
    return formatNumber(value, 3);
  }

  if (cat === "ERA" || cat === "WHIP") {
    return formatNumber(value, 2);
  }

  return formatNumber(value, 0);
}

function rankCategory(
  rows: Array<{ teamId: string; value: number }>,
  lowerIsBetter: boolean,
): Record<string, number> {
  const sorted = [...rows].sort((a, b) => {
    if (lowerIsBetter) {
      return a.value - b.value;
    }

    return b.value - a.value;
  });

  const teams = sorted.length;
  const result: Record<string, number> = {};

  sorted.forEach((row, index) => {
    result[row.teamId] = teams - index;
  });

  return result;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function activeAuctionEntries(entries: RosterEntry[]): RosterEntry[] {
  return entries.filter((entry) => !entry.isKeeper);
}

function entriesForTeam(entries: RosterEntry[], teamId: string): RosterEntry[] {
  return activeAuctionEntries(entries).filter((entry) => entry.teamId === teamId);
}

function rosterSlotList(rosterSlots: Record<string, number>): string[] {
  const result: string[] = [];

  for (const [slot, count] of Object.entries(rosterSlots)) {
    for (let i = 0; i < count; i += 1) {
      result.push(slot);
    }
  }

  return result;
}

function preferredSlotForPlayer(player: Player | null, leagueSlots: Record<string, number>): string {
  if (!player) {
    return "";
  }

  const possible = positionList(player);
  const slotKeys = Object.keys(leagueSlots);

  for (const pos of possible) {
    if (slotKeys.includes(pos)) {
      return pos;
    }
  }

  if (possible.some((pos) => ["C", "1B", "2B", "3B", "SS", "OF", "DH"].includes(pos))) {
    if (slotKeys.includes("UTIL")) {
      return "UTIL";
    }
  }

  if (slotKeys.includes("BN")) {
    return "BN";
  }

  return possible[0] ?? "";
}

function teamHasEligibleOpenSlot(
  teamEntries: RosterEntry[],
  player: Player | null,
  leagueSlots: Record<string, number>,
): boolean {
  if (!player) {
    return true;
  }

  const possible = positionList(player);
  const counts: Record<string, number> = {};

  for (const entry of teamEntries) {
    const slot = entry.rosterSlot.toUpperCase();
    counts[slot] = (counts[slot] ?? 0) + 1;
  }

  for (const pos of possible) {
    if ((leagueSlots[pos] ?? 0) > (counts[pos] ?? 0)) {
      return true;
    }
  }

  if (
    possible.some((pos) => ["C", "1B", "2B", "3B", "SS", "OF", "DH"].includes(pos)) &&
    (leagueSlots.UTIL ?? 0) > (counts.UTIL ?? 0)
  ) {
    return true;
  }

  if ((leagueSlots.BN ?? 0) > (counts.BN ?? 0)) {
    return true;
  }

  return false;
}

function currentCategoryNames(
  categories: ScoringCategory[] | undefined,
  side: StatSide,
): string[] {
  const filtered =
    categories
      ?.filter((category) => !category.type || category.type === side)
      .map((category) => normalizeCatName(category.name))
      .filter(Boolean) ?? [];

  if (filtered.length > 0) {
    return filtered;
  }

  return side === "batting" ? FALLBACK_HITTING_CATS : FALLBACK_PITCHING_CATS;
}

function playerSideAvailable(player: Player | null, side: StatSide): boolean {
  if (!player) {
    return false;
  }

  if (side === "batting") {
    return Boolean(player.projection?.batting || player.stats?.batting);
  }

  return Boolean(player.projection?.pitching || player.stats?.pitching);
}

function categoryImpactRows(
  player: Player | null,
  side: StatSide,
  scoringCategories: ScoringCategory[] | undefined,
): Array<{ cat: string; value: number; before: number; after: number; points: number }> {
  if (!player) {
    return [];
  }

  const cats = currentCategoryNames(scoringCategories, side);

  return cats.map((cat) => {
    const value = getCategoryValue(player, cat);

    return {
      cat,
      value,
      before: 0,
      after: value,
      points: 0,
    };
  });
}

function projectedStandingsRows(
  league: {
    teamNames: string[];
    scoringCategories: ScoringCategory[];
  } | null,
  players: Player[],
  roster: RosterEntry[],
): TeamProjectionRow[] {
  if (!league) {
    return [];
  }

  const categories = league.scoringCategories ?? [];
  const playerMap = new Map(players.map((player) => [player.id, player]));

  const rows: TeamProjectionRow[] = league.teamNames.map((teamName, index) => {
    const teamId = `team_${index + 1}`;
    const teamEntries = activeAuctionEntries(roster).filter((entry) => entry.teamId === teamId);
    const categoryValues: Record<string, number> = {};

    for (const category of categories) {
      const cat = normalizeCatName(category.name);
      const isRatio =
        cat === "AVG" ||
        cat === "OBP" ||
        cat === "SLG" ||
        cat === "ERA" ||
        cat === "WHIP";

      if (isRatio) {
        let weightedSum = 0;
        let totalWeight = 0;

        for (const entry of teamEntries) {
          const player = playerMap.get(entry.externalPlayerId);

          if (!player) {
            continue;
          }

          const ratio = getRatioValueAndWeight(player, cat);

          if (!ratio) {
            continue;
          }

          weightedSum += ratio.value * ratio.weight;
          totalWeight += ratio.weight;
        }

        categoryValues[cat] = totalWeight > 0 ? weightedSum / totalWeight : 0;
      } else {
        categoryValues[cat] = teamEntries.reduce((sum, entry) => {
          const player = playerMap.get(entry.externalPlayerId);

          return sum + (player ? getCategoryValue(player, cat) : 0);
        }, 0);
      }
    }

    return {
      teamId,
      teamName,
      totalPoints: 0,
      categoryValues,
      categoryPoints: {},
    };
  });

  for (const category of categories) {
    const cat = normalizeCatName(category.name);
    const pointsByTeam = rankCategory(
      rows.map((row) => ({
        teamId: row.teamId,
        value: row.categoryValues[cat] ?? 0,
      })),
      LOWER_IS_BETTER.has(cat),
    );

    rows.forEach((row) => {
      row.categoryPoints[cat] = pointsByTeam[row.teamId] ?? 0;
    });
  }

  rows.forEach((row) => {
    row.totalPoints = Object.values(row.categoryPoints).reduce(
      (sum, value) => sum + value,
      0,
    );
  });

  return rows.sort((a, b) => b.totalPoints - a.totalPoints);
}

function chipColor(position: string): { bg: string; border: string; text: string } {
  const normalized = position.toUpperCase();

  if (["C"].includes(normalized)) return { bg: "#3a1221", border: "#7f1d1d", text: "#fecaca" };
  if (["1B", "3B"].includes(normalized)) return { bg: "#3a240b", border: "#92400e", text: "#fcd34d" };
  if (["2B", "SS"].includes(normalized)) return { bg: "#082f49", border: "#0369a1", text: "#bae6fd" };
  if (["OF", "LF", "CF", "RF"].includes(normalized)) return { bg: "#052e20", border: "#047857", text: "#bbf7d0" };
  if (["SP", "RP", "P"].includes(normalized)) return { bg: "#1e1b4b", border: "#4f46e5", text: "#c7d2fe" };

  return { bg: "#251a3b", border: "#4c3575", text: "#ddd6fe" };
}

function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={{
        backgroundColor: COLORS.panel,
        borderColor: COLORS.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        ...(style ?? {}),
      }}
    >
      {children}
    </View>
  );
}

function SectionTitle({
  title,
  right,
}: {
  title: string;
  right?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: COLORS.purple2,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
      {right ? (
        <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "800" }}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

function SegmentButton({
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
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 42,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? COLORS.purple2 : COLORS.borderStrong,
        backgroundColor: selected ? COLORS.purple : COLORS.panel2,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        marginRight: 8,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: COLORS.text,
          fontSize: 13,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SmallButton({
  label,
  onPress,
  disabled = false,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger" | "ghost";
}) {
  const bg =
    tone === "primary"
      ? COLORS.purple
      : tone === "danger"
        ? "#4a111b"
        : tone === "ghost"
          ? "transparent"
          : COLORS.panel3;

  const border =
    tone === "primary"
      ? COLORS.purple2
      : tone === "danger"
        ? "#be123c"
        : COLORS.borderStrong;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 36,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: disabled ? "#33294a" : border,
        backgroundColor: disabled ? "#161020" : bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        marginRight: 8,
        marginBottom: 8,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          color: tone === "danger" ? "#fecdd3" : COLORS.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PositionBadge({ position }: { position: string }) {
  const colors = chipColor(position);

  return (
    <View
      style={{
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 5,
        marginBottom: 5,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "900" }}>
        {position}
      </Text>
    </View>
  );
}

function MetricTile({
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
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          color: COLORS.muted,
          fontSize: 10,
          fontWeight: "900",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? COLORS.yellow : COLORS.text,
          fontSize: 22,
          fontWeight: "900",
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function RowText({
  left,
  right,
  muted = false,
}: {
  left: string;
  right: string;
  muted?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 1,
        borderTopColor: "#271b3d",
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: muted ? COLORS.dim : COLORS.muted, flex: 1 }}>
        {left}
      </Text>
      <Text style={{ color: COLORS.text, fontWeight: "900", marginLeft: 10 }}>
        {right}
      </Text>
    </View>
  );
}

function PlayerIdentityCard({
  player,
  row,
  playerNote,
  onNoteChange,
}: {
  player: Player;
  row: ValuationResult | null;
  playerNote: string;
  onNoteChange: (value: string) => void;
}) {
  const imageUrl = getPlayerImageUrl(player);
  const positions = positionList(player);
  const tier = auctionTier(player, row);

  return (
    <Panel>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{
              width: 74,
              height: 74,
              borderRadius: 37,
              backgroundColor: COLORS.panel3,
              marginRight: 12,
            }}
          />
        ) : (
          <View
            style={{
              width: 74,
              height: 74,
              borderRadius: 37,
              backgroundColor: COLORS.panel3,
              marginRight: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "900" }}>
              {player.name.slice(0, 1)}
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
            <Text
              style={{
                color: COLORS.text,
                fontSize: 24,
                fontWeight: "900",
                marginRight: 8,
              }}
            >
              {player.name}
            </Text>
            <Text style={{ color: COLORS.muted, fontWeight: "900", marginRight: 8 }}>
              {player.team || "FA"}
            </Text>
            {positions.slice(0, 3).map((position) => (
              <PositionBadge key={position} position={position} />
            ))}
          </View>

          <Text style={{ color: COLORS.muted, fontWeight: "800", marginTop: 2 }}>
            Market ADP {formatNumber(marketAdp(player, row), 2)} · Auction{" "}
            {formatNumber(auctionRank(player, row), 0)} · Model{" "}
            {formatNumber(valueFromPlayer(player, "catalog_rank"), 0)}
            {tier !== null ? ` · T${Math.round(tier)}` : ""}
          </Text>

          <Text style={{ color: COLORS.dim, marginTop: 6 }}>
            Slots: {displayPositions(player)}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <SectionTitle title="Player Notes" />
        <TextInput
          value={playerNote}
          onChangeText={onNoteChange}
          placeholder="Scouting notes, injury watch, platoon risk..."
          placeholderTextColor={COLORS.dim}
          multiline
          style={{
            minHeight: 84,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.page,
            color: COLORS.text,
            padding: 10,
            textAlignVertical: "top",
          }}
        />
      </View>
    </Panel>
  );
}

function SearchBox({
  query,
  setQuery,
  suggestions,
  onSelect,
  onAddMissingPlayer,
}: {
  query: string;
  setQuery: (value: string) => void;
  suggestions: Player[];
  onSelect: (player: Player) => void;
  onAddMissingPlayer?: () => void;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search player to load into auction..."
        placeholderTextColor={COLORS.dim}
        style={{
          minHeight: 46,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          color: COLORS.text,
          paddingHorizontal: 14,
          fontWeight: "800",
        }}
      />

      {query.trim().length > 0 ? (
        <Panel style={{ marginTop: 6, marginBottom: 4 }}>
          {suggestions.length > 0 ? (
            suggestions.map((player) => (
              <TouchableOpacity
                key={player.id}
                activeOpacity={0.85}
                onPress={() => onSelect(player)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTopWidth: suggestions[0]?.id === player.id ? 0 : 1,
                  borderTopColor: "#271b3d",
                  paddingVertical: 9,
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {player.name}
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                    {player.team || "FA"} · {displayPositions(player)}
                  </Text>
                </View>
                <Text style={{ color: COLORS.yellow, fontWeight: "900" }}>
                  {money(player.value)}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <View>
              <Text style={{ color: COLORS.muted, marginBottom: 8 }}>
                No matching available players.
              </Text>
              {onAddMissingPlayer ? (
                <SmallButton
                  label="Add missing player"
                  tone="primary"
                  onPress={onAddMissingPlayer}
                />
              ) : null}
            </View>
          )}
        </Panel>
      ) : null}
    </View>
  );
}

function CategoryImpactSection({
  player,
  side,
  setSide,
  scoringCategories,
}: {
  player: Player;
  side: StatSide;
  setSide: (side: StatSide) => void;
  scoringCategories: ScoringCategory[];
}) {
  const rows = categoryImpactRows(player, side, scoringCategories);

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <SectionTitle title="Category Impact" />
        <View style={{ flexDirection: "row", width: 180 }}>
          <SegmentButton
            label="Hitting"
            selected={side === "batting"}
            onPress={() => setSide("batting")}
          />
          <SegmentButton
            label="Pitching"
            selected={side === "pitching"}
            onPress={() => setSide("pitching")}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {rows.map((row) => (
          <View
            key={`${side}-${row.cat}`}
            style={{
              width: 150,
              backgroundColor: COLORS.panel,
              borderColor: COLORS.border,
              borderWidth: 1,
              borderRadius: 14,
              padding: 12,
              marginRight: 8,
            }}
          >
            <Text
              style={{
                color: COLORS.purple2,
                fontSize: 11,
                fontWeight: "900",
                textTransform: "uppercase",
              }}
            >
              {row.cat}
            </Text>
            <Text
              style={{
                color: COLORS.text,
                fontSize: 28,
                fontWeight: "900",
                marginTop: 8,
              }}
            >
              {formatCategoryValue(row.cat, row.value)}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 8 }}>
              {formatCategoryValue(row.cat, row.before)} →{" "}
              {formatCategoryValue(row.cat, row.after)}
            </Text>
            <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 4 }}>
              {row.points} pts
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function LogPickPanel({
  leagueTeams,
  selectedTeamNumber,
  setSelectedTeamNumber,
  price,
  setPrice,
  rosterSlot,
  setRosterSlot,
  slotOptions,
  disabled,
  onSubmit,
}: {
  leagueTeams: string[];
  selectedTeamNumber: string;
  setSelectedTeamNumber: (value: string) => void;
  price: string;
  setPrice: (value: string) => void;
  rosterSlot: string;
  setRosterSlot: (value: string) => void;
  slotOptions: string[];
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <Panel>
      <SectionTitle title="Log Result" />

      <Text style={{ color: COLORS.muted, marginBottom: 8 }}>
        Record the winning bid. This updates roster, draft log, valuations, budget, and standings.
      </Text>

      <Text style={{ color: COLORS.muted, fontWeight: "900", marginBottom: 6 }}>
        Won by
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {leagueTeams.map((teamName, index) => {
          const value = String(index + 1);

          return (
            <SmallButton
              key={teamName}
              label={`${index + 1}. ${teamName}`}
              tone={selectedTeamNumber === value ? "primary" : "default"}
              onPress={() => setSelectedTeamNumber(value)}
            />
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="Final price"
          keyboardType="numeric"
          placeholderTextColor={COLORS.dim}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.page,
            color: COLORS.text,
            paddingHorizontal: 12,
            marginRight: 8,
            fontWeight: "800",
          }}
        />
        <TextInput
          value={rosterSlot}
          onChangeText={(value) => setRosterSlot(value.toUpperCase())}
          placeholder="Slot"
          autoCapitalize="characters"
          placeholderTextColor={COLORS.dim}
          style={{
            width: 110,
            minHeight: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.page,
            color: COLORS.text,
            paddingHorizontal: 12,
            fontWeight: "800",
          }}
        />
      </View>

      {slotOptions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {slotOptions.map((slot) => (
            <SmallButton
              key={slot}
              label={slot}
              tone={rosterSlot.toUpperCase() === slot.toUpperCase() ? "primary" : "default"}
              onPress={() => setRosterSlot(slot)}
            />
          ))}
        </ScrollView>
      ) : null}

      <SmallButton
        label={disabled ? "Logging..." : "Log Pick"}
        tone="primary"
        disabled={disabled}
        onPress={onSubmit}
      />
    </Panel>
  );
}

export default function CommandCenterScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token, user } = useAuth();
  const { allLeagues } = useLeague();
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { getNote, loadNotes, setNote } = usePlayerNotes();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;
  const myTeamId = "team_1";

  const [activeView, setActiveView] = useState<CommandView>("Auction");
  const [players, setPlayers] = useState<Player[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statSide, setStatSide] = useState<StatSide>("batting");
  const [price, setPrice] = useState("");
  const [rosterSlot, setRosterSlot] = useState("");
  const [teamNumber, setTeamNumber] = useState("1");
  const [addingPick, setAddingPick] = useState(false);
  const [workingPickId, setWorkingPickId] = useState<string | null>(null);
  const [editingPickId, setEditingPickId] = useState<string | null>(null);
  const [editTeamNumber, setEditTeamNumber] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editSlot, setEditSlot] = useState("");
  const [selectedMakeupTeamId, setSelectedMakeupTeamId] = useState(myTeamId);
  const [liquidityMode, setLiquidityMode] = useState<"Liquidity" | "Standings">("Liquidity");
  const [valuationSnapshot, setValuationSnapshot] =
    useState<ValuationPlayerResponse | null>(null);
  const [valuationMarketNotes, setValuationMarketNotes] = useState<string[]>([]);
  const [engineScarcity, setEngineScarcity] = useState<ScarcityResponse | null>(null);
  const [newsStrip, setNewsStrip] = useState<string | null>(null);
  const [mockPredictions, setMockPredictions] = useState<MockPickPrediction[]>([]);
  const [loadingMockPicks, setLoadingMockPicks] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league),
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
    () => rosterValuationFingerprint(roster),
    [roster],
  );

  const draftedIds = useMemo(
    () => new Set(roster.map((entry) => entry.externalPlayerId)),
    [roster],
  );

  const selectedValuation = useMemo(
    () => valuationForPlayer(selectedPlayer, valuationSnapshot),
    [selectedPlayer, valuationSnapshot],
  );

  const teamData = useMemo(
    () =>
      league
        ? computeTeamData(
            {
              teamNames: league.teamNames,
              rosterSlots: league.rosterSlots,
              budget: league.budget,
            },
            activeAuctionEntries(roster),
          )
        : [],
    [league, roster],
  );

  const selectedTeamData = useMemo(() => {
    const index = Number(teamNumber) - 1;

    return teamData[index] ?? teamData[0] ?? null;
  }, [teamData, teamNumber]);

  const myTeamData = teamData[0] ?? null;

  const scoringCategories = (league?.scoringCategories ?? []) as ScoringCategory[];

  const allSearchPlayers = useMemo(
    () =>
      players
        .filter((player) => !draftSetHasPlayer(draftedIds, player))
        .sort((a, b) => {
          const valueDiff = (b.value ?? 0) - (a.value ?? 0);

          if (Math.abs(valueDiff) > 0.001) {
            return valueDiff;
          }

          return (a.adp ?? 9999) - (b.adp ?? 9999);
        }),
    [players, draftedIds],
  );

  const playerSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (!q) {
      return [];
    }

    return allSearchPlayers
      .filter((player) => playerSearchText(player).includes(q))
      .slice(0, 8);
  }, [allSearchPlayers, searchQuery]);

  const boardRowMap = useMemo(() => {
    const map = new Map<string, ValuationResult>();

    for (const row of valuationSnapshot?.valuations ?? []) {
      map.set(row.player_id, row);
    }

    return map;
  }, [valuationSnapshot]);

  const selectedPrimaryPosition = primaryPosition(selectedPlayer);

  const localPositionMarket = useMemo(() => {
    if (!selectedPrimaryPosition) {
      return null;
    }

    const undraftedAtPos = players.filter(
      (player) =>
        !draftSetHasPlayer(draftedIds, player) &&
        playerMatchesPosition(player, selectedPrimaryPosition),
    );
    const draftedAtPos = activeAuctionEntries(roster).filter((entry) => {
      const slot = entry.rosterSlot.toUpperCase();
      const positions = (entry.positions ?? []).map((position) => position.toUpperCase());

      if (selectedPrimaryPosition === "OF") {
        return slot === "OF" || ["OF", "LF", "CF", "RF"].some((pos) => positions.includes(pos));
      }

      return slot === selectedPrimaryPosition || positions.includes(selectedPrimaryPosition);
    });
    const catalogValues = undraftedAtPos
      .map((player) => finiteNumber(player.value))
      .filter((value): value is number => value !== null);
    const paidValues = draftedAtPos.map((entry) => entry.price);
    const avgCatalogValue = average(catalogValues);
    const avgPaid = average(paidValues);
    const delta = avgPaid - avgCatalogValue;

    return {
      position: selectedPrimaryPosition,
      avgCatalogValue,
      avgPaid,
      delta,
      eliteLeft: undraftedAtPos.filter((player) => (player.tier ?? 99) <= 2).length,
      midLeft: undraftedAtPos.filter((player) => (player.tier ?? 99) === 3).length,
      totalLeft: undraftedAtPos.length,
    };
  }, [draftedIds, players, roster, selectedPrimaryPosition]);

  const enginePosRow = useMemo(() => {
    if (!engineScarcity || !selectedPrimaryPosition) {
      return null;
    }

    return (
      engineScarcity.positions.find(
        (position) =>
          position.position.toUpperCase() === selectedPrimaryPosition.toUpperCase(),
      ) ??
      engineScarcity.positions[0] ??
      null
    );
  }, [engineScarcity, selectedPrimaryPosition]);

  const selectedTierBuckets = useMemo(() => {
    if (!engineScarcity || !selectedPrimaryPosition) {
      return [];
    }

    const exact =
      engineScarcity.tier_buckets?.find(
        (bucket) =>
          bucket.position.toUpperCase() === selectedPrimaryPosition.toUpperCase(),
      ) ?? null;

    return exact?.buckets ?? [];
  }, [engineScarcity, selectedPrimaryPosition]);

  const projectedStandings = useMemo(
    () => projectedStandingsRows(league, players, roster),
    [league, players, roster],
  );

  const currentTeamStanding = useMemo(() => {
    const teamName = teamNameFromId(myTeamId, league?.teamNames);

    return projectedStandings.find((row) => row.teamName === teamName) ?? projectedStandings[0] ?? null;
  }, [league?.teamNames, projectedStandings]);

  const currentTeamRank = useMemo(() => {
    if (!currentTeamStanding) {
      return null;
    }

    const index = projectedStandings.findIndex((row) => row.teamId === currentTeamStanding.teamId);

    return index >= 0 ? index + 1 : null;
  }, [currentTeamStanding, projectedStandings]);

  const rosterSlots = useMemo(
    () => rosterSlotList(league?.rosterSlots ?? {}),
    [league?.rosterSlots],
  );

  const selectedTeamEntries = useMemo(
    () => entriesForTeam(roster, selectedMakeupTeamId),
    [roster, selectedMakeupTeamId],
  );

  const teamMakeupRows = useMemo(() => {
    if (!league) {
      return [];
    }

    const entries = [...selectedTeamEntries];
    const rows = rosterSlots.map((slot, index) => {
      const foundIndex = entries.findIndex((entry) => {
        const entrySlot = entry.rosterSlot.toUpperCase();

        if (entrySlot === slot.toUpperCase()) {
          return true;
        }

        if (slot === "OF") {
          return (entry.positions ?? []).some((position) =>
            ["OF", "LF", "CF", "RF"].includes(position.toUpperCase()),
          );
        }

        if (slot === "UTIL") {
          return ["C", "1B", "2B", "3B", "SS", "OF", "DH"].some((position) =>
            (entry.positions ?? []).map((p) => p.toUpperCase()).includes(position),
          );
        }

        if (slot === "BN") {
          return true;
        }

        return false;
      });
      const entry = foundIndex >= 0 ? entries.splice(foundIndex, 1)[0] : null;
      const totalSlots = rosterSlots.length || 1;
      const target = Math.round(((league.budget ?? 260) / totalSlots) * 10) / 10;

      return {
        key: `${slot}-${index}`,
        slot,
        playerName: entry?.playerName ?? "— empty —",
        target,
        price: entry?.price ?? null,
        filled: entry !== null,
      };
    });

    return rows;
  }, [league, rosterSlots, selectedTeamEntries]);

  const recentPicks = useMemo(
    () =>
      [...activeAuctionEntries(roster)].sort(
        (a, b) =>
          new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
          new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
      ),
    [roster],
  );

  const draftRoomNote = getNote(leagueId, "__draft__");
  const playerNote = selectedPlayer ? getNote(leagueId, selectedPlayer.id) : "";

  const cacheContext = useMemo(
    () => ({
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationKey,
    }),
    [leagueValuationKey, rosterValuationKey],
  );

  const refreshRosterAndEngine = useCallback(async () => {
    if (!token || !league) {
      return;
    }

    const rosterData = await getRoster(leagueId, token);
    setRoster(rosterData);

    const nextCacheContext = {
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationFingerprint(rosterData),
    };

    const board = await getValuation(leagueId, token, myTeamId, nextCacheContext).catch(
      () => null,
    );

    if (board) {
      setValuationSnapshot(board);
      setValuationMarketNotes(board.market_notes ?? []);
    }
  }, [league, leagueId, leagueValuationKey, token]);

  useEffect(() => {
    async function loadInitialData() {
      if (!token || !league) {
        setLoading(false);
        return;
      }

      try {
        const [playerData, rosterData] = await Promise.all([
          getPlayers("catalog_rank", league.posEligibilityThreshold, league.playerPool),
          getRoster(leagueId, token),
          loadNotes(leagueId),
        ]);

        setPlayers(playerData);
        setRoster(rosterData);

        const nextCacheContext = {
          leagueConfigKey: leagueValuationKey,
          rosterFingerprint: rosterValuationFingerprint(rosterData),
        };

        const board = await getValuation(leagueId, token, myTeamId, nextCacheContext).catch(
          () => null,
        );

        if (board) {
          setValuationSnapshot(board);
          setValuationMarketNotes(board.market_notes ?? []);
        }
      } finally {
        setLoading(false);
      }
    }

    void loadInitialData();
  }, [
    league,
    leagueId,
    leagueValuationKey,
    loadNotes,
    token,
  ]);

  useEffect(() => {
    if (!selectedPlayer) {
      return;
    }

    const fullPlayer =
      players.find((player) => player.id === selectedPlayer.id) ??
      players.find(
        (player) =>
          player.name.toLowerCase() === selectedPlayer.name.toLowerCase() &&
          player.team.toLowerCase() === selectedPlayer.team.toLowerCase(),
      );

    if (fullPlayer && fullPlayer !== selectedPlayer) {
      setSelectedPlayer(fullPlayer);
    }
  }, [players, selectedPlayer, setSelectedPlayer]);

  useEffect(() => {
    if (!selectedPlayer || !league) {
      return;
    }

    if (!rosterSlot) {
      setRosterSlot(preferredSlotForPlayer(selectedPlayer, league.rosterSlots));
    }

    if (!price) {
      const bid = recommendedBid(selectedPlayer, selectedValuation);
      setPrice(bid !== null ? String(Math.round(bid)) : String(Math.round(selectedPlayer.value ?? 1)));
    }

    if (playerSideAvailable(selectedPlayer, "batting")) {
      setStatSide("batting");
    } else if (playerSideAvailable(selectedPlayer, "pitching")) {
      setStatSide("pitching");
    }
  }, [league, price, rosterSlot, selectedPlayer, selectedValuation]);

  useEffect(() => {
    if (!token) {
      setNewsStrip(null);
      return;
    }

    const handle = setTimeout(() => {
      void getNewsSignals(token, { days: 7 })
        .then((response) => {
          setNewsStrip(
            response.count > 0
              ? `${response.count} news signal${response.count === 1 ? "" : "s"} (7d, Engine)`
              : null,
          );
        })
        .catch(() => setNewsStrip(null));
    }, 1000);

    return () => clearTimeout(handle);
  }, [token]);

  useEffect(() => {
    if (!leagueId || !token || !selectedPlayer || !leagueValuationKey) {
      return;
    }

    let cancelled = false;

    void getValuationPlayer(leagueId, token, selectedPlayer.id, myTeamId, {
      cacheContext,
      explainValuationRows: true,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setValuationSnapshot(response);
        setValuationMarketNotes(response.market_notes ?? []);
      })
      .catch(() => {
        // Keep board valuation if focused player request fails.
      });

    return () => {
      cancelled = true;
    };
  }, [
    cacheContext,
    leagueId,
    leagueValuationKey,
    selectedPlayer?.id,
    token,
  ]);

  useEffect(() => {
    if (!leagueId || !token || !selectedPrimaryPosition) {
      setEngineScarcity(null);
      return;
    }

    let cancelled = false;

    void getScarcity(leagueId, token, selectedPrimaryPosition)
      .then((response) => {
        if (!cancelled) {
          setEngineScarcity(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEngineScarcity(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId, roster.length, selectedPrimaryPosition, token]);

  useEffect(() => {
    if (!league || !token || players.length === 0) {
      setMockPredictions([]);
      return;
    }

    const budgetByTeamId = Object.fromEntries(
      league.teamNames.map((_, index) => {
        const key = `team_${index + 1}`;
        const team = teamData[index];

        return [key, team?.remaining ?? league.budget];
      }),
    );

    const availablePlayerIds = allSearchPlayers
      .filter((player) => !player.id.startsWith("custom:"))
      .slice(0, 250)
      .map((player) => player.id);

    let cancelled = false;
    setLoadingMockPicks(true);

    void getMockPick(leagueId, token, budgetByTeamId, availablePlayerIds)
      .then((response) => {
        if (!cancelled) {
          setMockPredictions(response.predictions ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMockPredictions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMockPicks(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allSearchPlayers, league, leagueId, players.length, teamData, token]);

  function handleSelectPlayer(player: Player) {
    setSelectedPlayer(player);
    setSearchQuery("");
    setPrice("");
    setRosterSlot(league ? preferredSlotForPlayer(player, league.rosterSlots) : "");
    setActiveView("Auction");
  }

  async function handleAddPick() {
    if (!token || !league || !selectedPlayer) {
      return;
    }

    if (draftSetHasPlayer(draftedIds, selectedPlayer)) {
      Alert.alert(
        "Player already drafted",
        "This player already has a roster entry in this league and cannot be drafted again.",
      );
      return;
    }

    const teamValue = Number(teamNumber);
    const priceValue = Number(price);
    const nextSlot = rosterSlot.trim().toUpperCase();

    if (!Number.isInteger(teamValue) || teamValue < 1 || teamValue > league.teams) {
      Alert.alert("Invalid team", `Choose a team from 1 to ${league.teams}.`);
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      Alert.alert("Invalid price", "Enter a non-negative auction price.");
      return;
    }

    if (!nextSlot) {
      Alert.alert("Missing slot", "Enter a roster slot such as OF, SP, RP, UTIL, or BN.");
      return;
    }

    const teamId = teamIdFromNumber(teamNumber);
    const teamEntries = entriesForTeam(roster, teamId);

    if (!teamHasEligibleOpenSlot(teamEntries, selectedPlayer, league.rosterSlots)) {
      Alert.alert(
        "No eligible slot",
        `${teamNameFromId(teamId, league.teamNames)} does not appear to have an open eligible slot for ${selectedPlayer.name}. You can still change the slot if your league allows an override.`,
      );
    }

    setAddingPick(true);

    try {
      const payload: RosterEntryPayload = {
        externalPlayerId: selectedPlayer.id,
        playerName: selectedPlayer.name,
        playerTeam: selectedPlayer.team,
        positions: selectedPlayer.positions ?? [selectedPlayer.position],
        price: priceValue,
        rosterSlot: nextSlot,
        isKeeper: false,
        userId: user?.id,
        teamId,
      };

      const created = await addRosterEntry(leagueId, payload, token);
      setUndoStack((current) => [...current, { kind: "add", entry: created }]);
      setRedoStack([]);
      await refreshRosterAndEngine();
      setPrice("");
      setSearchQuery("");
      Alert.alert("Pick logged", `${selectedPlayer.name} was drafted by ${teamNameFromId(teamId, league.teamNames)}.`);
    } catch (err) {
      Alert.alert(
        "Failed to log pick",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setAddingPick(false);
    }
  }

  function startEditingPick(entry: RosterEntry) {
    setEditingPickId(entry._id);
    setEditTeamNumber(teamNumberFromId(entry.teamId));
    setEditPrice(String(entry.price));
    setEditSlot(entry.rosterSlot);
    setActiveView("Log");
  }

  function cancelEditingPick() {
    setEditingPickId(null);
    setEditTeamNumber("1");
    setEditPrice("");
    setEditSlot("");
  }

  async function handleSavePick(entry: RosterEntry) {
    if (!token || !league) {
      return;
    }

    const nextTeam = Number(editTeamNumber);
    const nextPrice = Number(editPrice);
    const nextSlot = editSlot.trim().toUpperCase();

    if (!Number.isInteger(nextTeam) || nextTeam < 1 || nextTeam > league.teams) {
      Alert.alert("Invalid team", `Enter a team number from 1 to ${league.teams}.`);
      return;
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      Alert.alert("Invalid price", "Enter a non-negative price.");
      return;
    }

    if (!nextSlot) {
      Alert.alert("Invalid slot", "Enter a roster slot.");
      return;
    }

    setWorkingPickId(entry._id);

    try {
      const updated = await updateRosterEntry(
        leagueId,
        entry._id,
        {
          price: nextPrice,
          rosterSlot: nextSlot,
          teamId: `team_${nextTeam}`,
        },
        token,
      );

      setUndoStack((current) => [...current, { kind: "update", before: entry, after: updated }]);
      setRedoStack([]);
      await refreshRosterAndEngine();
      cancelEditingPick();
      Alert.alert("Pick updated", `${entry.playerName} was updated.`);
    } catch (err) {
      Alert.alert(
        "Failed to update pick",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setWorkingPickId(null);
    }
  }

  async function handleDeletePick(entry: RosterEntry, addUndo = true) {
    if (!token) {
      return;
    }

    setWorkingPickId(entry._id);

    try {
      await removeRosterEntry(leagueId, entry._id, token);

      if (addUndo) {
        setUndoStack((current) => [...current, { kind: "delete", entry }]);
        setRedoStack([]);
      }

      await refreshRosterAndEngine();

      if (editingPickId === entry._id) {
        cancelEditingPick();
      }
    } catch (err) {
      Alert.alert(
        "Failed to remove pick",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setWorkingPickId(null);
    }
  }

  async function restoreEntry(entry: RosterEntry): Promise<RosterEntry | null> {
    if (!token) {
      return null;
    }

    const restored = await addRosterEntry(
      leagueId,
      {
        externalPlayerId: entry.externalPlayerId,
        playerName: entry.playerName,
        playerTeam: entry.playerTeam,
        positions: entry.positions,
        price: entry.price,
        rosterSlot: entry.rosterSlot,
        isKeeper: entry.isKeeper,
        keeperContract: entry.keeperContract,
        userId: entry.userId,
        teamId: entry.teamId,
      },
      token,
    );

    return restored;
  }

  async function handleUndo() {
    if (!token || undoStack.length === 0) {
      return;
    }

    const action = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));

    try {
      if (action.kind === "add") {
        await removeRosterEntry(leagueId, action.entry._id, token);
      } else if (action.kind === "delete") {
        await restoreEntry(action.entry);
      } else {
        await updateRosterEntry(
          leagueId,
          action.after._id,
          {
            price: action.before.price,
            rosterSlot: action.before.rosterSlot,
            teamId: action.before.teamId,
            keeperContract: action.before.keeperContract,
          },
          token,
        );
      }

      setRedoStack((current) => [...current, action]);
      await refreshRosterAndEngine();
    } catch (err) {
      Alert.alert("Undo failed", err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleRedo() {
    if (!token || redoStack.length === 0) {
      return;
    }

    const action = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));

    try {
      if (action.kind === "add") {
        await restoreEntry(action.entry);
      } else if (action.kind === "delete") {
        const found = roster.find((entry) => entry.externalPlayerId === action.entry.externalPlayerId);

        if (found) {
          await removeRosterEntry(leagueId, found._id, token);
        }
      } else {
        await updateRosterEntry(
          leagueId,
          action.before._id,
          {
            price: action.after.price,
            rosterSlot: action.after.rosterSlot,
            teamId: action.after.teamId,
            keeperContract: action.after.keeperContract,
          },
          token,
        );
      }

      setUndoStack((current) => [...current, action]);
      await refreshRosterAndEngine();
    } catch (err) {
      Alert.alert("Redo failed", err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function openPlayerById(playerId: string) {
    const found = players.find((player) => player.id === playerId);

    if (!found) {
      Alert.alert("Player not found", "That player is not currently in the loaded catalog.");
      return;
    }

    handleSelectPlayer(found);
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.page, padding: 16 }}>
        <LoadingState label="Loading command center..." />
      </SafeAreaView>
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.page, padding: 16 }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  const selectedDraftState = resolvePlayerDraftState({
    player: selectedPlayer,
    draftedIds,
  });
  const currentPlayerDrafted = selectedDraftState.isDrafted;
  const rawSelectedBid = recommendedBid(selectedPlayer, selectedValuation);
  const rawSelectedAuctionValue = auctionValue(selectedPlayer, selectedValuation);
  const rawSelectedTeamValue = teamValue(selectedPlayer, selectedValuation);
  const rawSelectedEdge = bidEdge(selectedPlayer, selectedValuation);
  const selectedBid = currentPlayerDrafted ? null : rawSelectedBid;
  const selectedAuctionValue = currentPlayerDrafted ? null : rawSelectedAuctionValue;
  const selectedTeamValue = currentPlayerDrafted ? null : rawSelectedTeamValue;
  const selectedEdge = currentPlayerDrafted ? null : rawSelectedEdge;
  const selectedPosition = selectedPrimaryPosition ?? "—";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.page }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 14,
          paddingBottom: 110,
        }}
      >
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: "900" }}>
            Command Center
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 4 }}>
            Auction cockpit for search, valuation, roster impact, budget, and draft log.
          </Text>
        </View>

        <SearchBox
          query={searchQuery}
          setQuery={setSearchQuery}
          suggestions={playerSuggestions}
          onSelect={handleSelectPlayer}
        />

        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          {(["Auction", "Market", "Teams", "Standings", "Log"] as CommandView[]).map((view) => (
            <SegmentButton
              key={view}
              label={view}
              selected={activeView === view}
              onPress={() => setActiveView(view)}
            />
          ))}
        </View>

        {newsStrip ? (
          <Panel style={{ backgroundColor: "#111c2e", borderColor: "#2563eb" }}>
            <Text style={{ color: "#bfdbfe", fontWeight: "900" }}>
              {newsStrip}
            </Text>
          </Panel>
        ) : null}

        {activeView === "Auction" ? (
          <>
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              <SmallButton
                label={`Undo${undoStack.length > 0 ? ` (${undoStack.length})` : ""}`}
                tone="ghost"
                disabled={undoStack.length === 0}
                onPress={() => void handleUndo()}
              />
              <SmallButton
                label={`Redo${redoStack.length > 0 ? ` (${redoStack.length})` : ""}`}
                tone="ghost"
                disabled={redoStack.length === 0}
                onPress={() => void handleRedo()}
              />
              {selectedPlayer ? (
                <SmallButton
                  label="Clear player"
                  tone="ghost"
                  onPress={() => setSelectedPlayer(null)}
                />
              ) : null}
            </View>

            {selectedPlayer ? (
              <>
                <PlayerIdentityCard
                  player={selectedPlayer}
                  row={selectedValuation}
                  playerNote={playerNote}
                  onNoteChange={(text) => setNote(leagueId, selectedPlayer.id, text)}
                />

                <CategoryImpactSection
                  player={selectedPlayer}
                  side={statSide}
                  setSide={setStatSide}
                  scoringCategories={scoringCategories}
                />

                <Panel>
                  <SectionTitle title="Bid Recommendation" />
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <MetricTile
                      label="Auction Value"
                      value={money(selectedAuctionValue)}
                      highlight
                    />
                    <MetricTile
                      label="Suggested Bid"
                      value={money(selectedBid)}
                      highlight
                    />
                    <MetricTile
                      label="Your Team Value"
                      value={money(selectedTeamValue)}
                    />
                    <MetricTile
                      label="Bid Edge"
                      value={signedMoney(selectedEdge)}
                    />
                  </View>
                </Panel>

                <BidDecisionCard
                  selectedPlayer={selectedPlayer}
                  valuationRow={selectedValuation}
                  isDrafted={currentPlayerDrafted}
                />

                {currentPlayerDrafted ? (
                  <Panel style={{ borderColor: "#7f1d1d", backgroundColor: "#1d0e18" }}>
                    <Text style={{ color: "#fecaca", fontWeight: "900" }}>
                      This player is already drafted.
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 19 }}>
                      Command Center keeps stats and context visible, but live bid values and the Log Pick action are disabled for rostered players.
                    </Text>
                  </Panel>
                ) : null}

                <LogPickPanel
                  leagueTeams={league.teamNames}
                  selectedTeamNumber={teamNumber}
                  setSelectedTeamNumber={setTeamNumber}
                  price={price}
                  setPrice={setPrice}
                  rosterSlot={rosterSlot}
                  setRosterSlot={setRosterSlot}
                  slotOptions={Object.keys(league.rosterSlots)}
                  disabled={addingPick || currentPlayerDrafted}
                  onSubmit={() => void handleAddPick()}
                />

                <Panel>
                  <SectionTitle title="Draft Notes" />
                  <TextInput
                    value={draftRoomNote}
                    onChangeText={(text) => setNote(leagueId, "__draft__", text)}
                    placeholder="Draft strategy, targets, budget rules..."
                    placeholderTextColor={COLORS.dim}
                    multiline
                    style={{
                      minHeight: 110,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.page,
                      color: COLORS.text,
                      padding: 10,
                      textAlignVertical: "top",
                    }}
                  />
                </Panel>
              </>
            ) : (
              <Panel
                style={{
                  minHeight: 300,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: COLORS.purple2, fontSize: 42, fontWeight: "200" }}>
                  ⊕
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 18, fontWeight: "900" }}>
                  No player loaded
                </Text>
                <Text style={{ color: COLORS.dim, marginTop: 8, textAlign: "center" }}>
                  Search above or open a player from Research to begin the auction workflow.
                </Text>
              </Panel>
            )}
          </>
        ) : null}

        {activeView === "Market" ? (
          <>
            <Panel>
              <SectionTitle title="Position Market" right={selectedPosition} />
              <RowText
                left="Avg winning price"
                right={
                  localPositionMarket
                    ? money(localPositionMarket.avgPaid)
                    : "—"
                }
              />
              <RowText
                left="Draftroom avg $"
                right={
                  localPositionMarket
                    ? money(localPositionMarket.avgCatalogValue)
                    : "—"
                }
              />
              <RowText
                left="Draftroom spend vs $"
                right={
                  localPositionMarket
                    ? signedMoney(localPositionMarket.delta)
                    : "—"
                }
              />

              {localPositionMarket ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 12,
                  }}
                >
                  <MetricTile
                    label="Elite left"
                    value={String(localPositionMarket.eliteLeft)}
                  />
                  <MetricTile
                    label="Total left"
                    value={String(localPositionMarket.totalLeft)}
                  />
                </View>
              ) : null}
            </Panel>

            <Panel>
              <SectionTitle title="Your Standings" right="Projected" />
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
                {currentTeamStanding
                  ? `${currentTeamStanding.totalPoints} pts`
                  : "—"}
                {currentTeamRank ? ` · ${currentTeamRank} / ${projectedStandings.length}` : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                {currentTeamStanding
                  ? scoringCategories.slice(0, 8).map((category) => {
                      const cat = normalizeCatName(category.name);
                      const points = currentTeamStanding.categoryPoints[cat] ?? 0;

                      return (
                        <View
                          key={cat}
                          style={{
                            width: "25%",
                            paddingRight: 6,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: COLORS.muted, fontWeight: "900" }}>
                            {cat}
                          </Text>
                          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                            {points}
                          </Text>
                        </View>
                      );
                    })
                  : null}
              </View>
            </Panel>

            <Panel>
              <SectionTitle title="Team Makeup" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {league.teamNames.map((teamName, index) => {
                  const teamId = `team_${index + 1}`;

                  return (
                    <SmallButton
                      key={teamId}
                      label={`${teamName}${teamId === myTeamId ? " (You)" : ""}`}
                      tone={selectedMakeupTeamId === teamId ? "primary" : "default"}
                      onPress={() => setSelectedMakeupTeamId(teamId)}
                    />
                  );
                })}
              </ScrollView>

              {teamMakeupRows.slice(0, 16).map((row) => (
                <View
                  key={row.key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderTopWidth: 1,
                    borderTopColor: "#271b3d",
                    paddingVertical: 7,
                  }}
                >
                  <PositionBadge position={row.slot} />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: row.filled ? COLORS.text : COLORS.dim,
                      flex: 1,
                      marginLeft: 4,
                    }}
                  >
                    {row.playerName}
                  </Text>
                  <Text style={{ color: COLORS.muted, width: 54, textAlign: "right" }}>
                    {money(row.target)}
                  </Text>
                  <Text
                    style={{
                      color:
                        row.price === null
                          ? COLORS.dim
                          : row.price <= row.target
                            ? COLORS.green
                            : COLORS.red,
                      width: 54,
                      textAlign: "right",
                      fontWeight: "900",
                    }}
                  >
                    {row.price === null ? "—" : money(row.price)}
                  </Text>
                </View>
              ))}
            </Panel>

            {enginePosRow ? (
              <Panel>
                <SectionTitle title={`Engine Scarcity · ${enginePosRow.position}`} />
                <RowText left="Scarcity score" right={String(enginePosRow.scarcity_score)} />
                <RowText left="Elite left" right={String(enginePosRow.elite_remaining)} />
                <RowText left="Mid-tier left" right={String(enginePosRow.mid_tier_remaining)} />
                <RowText left="Total left" right={String(enginePosRow.total_remaining)} />
                {enginePosRow.alert ? (
                  <Text style={{ color: COLORS.muted, marginTop: 8 }}>
                    {enginePosRow.alert}
                  </Text>
                ) : null}

                {engineScarcity?.selected_position_explainer ? (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: "#102417",
                      borderWidth: 1,
                      borderColor: "#14532d",
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.green,
                        fontWeight: "900",
                        textTransform: "uppercase",
                      }}
                    >
                      {engineScarcity.selected_position_explainer.severity}
                    </Text>
                    <Text style={{ color: "#bbf7d0", marginTop: 4 }}>
                      {engineScarcity.selected_position_explainer.message}
                    </Text>
                    <Text style={{ color: "#bbf7d0", marginTop: 4 }}>
                      {engineScarcity.selected_position_explainer.recommended_action}
                    </Text>
                  </View>
                ) : null}

                {selectedTierBuckets.length > 0 ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", marginBottom: 6 }}>
                      Tier Buckets
                    </Text>
                    {selectedTierBuckets.map((bucket) => (
                      <RowText
                        key={bucket.tier}
                        left={`${bucket.tier}`}
                        right={`${bucket.remaining} left · urgency ${bucket.urgency_score}`}
                      />
                    ))}
                  </View>
                ) : null}
              </Panel>
            ) : null}

            {valuationSnapshot ? (
              <Panel>
                <SectionTitle title="Engine Context" />
                {valuationMarketNotes.slice(0, 5).map((note, index) => (
                  <Text key={`${note}-${index}`} style={{ color: COLORS.muted, marginBottom: 6 }}>
                    • {note}
                  </Text>
                ))}
                <RowText
                  left="Inflation"
                  right={`${formatNumber(valuationSnapshot.inflation_factor, 2)}×`}
                />
                <RowText
                  left="Budget left"
                  right={money(valuationSnapshot.total_budget_remaining)}
                />
                <RowText
                  left="Players left"
                  right={String(valuationSnapshot.players_remaining)}
                />
              </Panel>
            ) : null}
          </>
        ) : null}

        {activeView === "Teams" ? (
          <>
            <Panel>
              <SectionTitle title="Bid Context" />
              <RowText left="Budget max" right={money(myTeamData?.maxBid)} />
              <RowText left="Budget left" right={money(myTeamData?.remaining)} />
              <RowText
                left="$ / slot"
                right={myTeamData ? `$${formatNumber(myTeamData.ppSpot, 1)}` : "—"}
              />
            </Panel>

            <Panel>
              <SectionTitle title="Liquidity" />
              <View
                style={{
                  flexDirection: "row",
                  borderBottomWidth: 1,
                  borderBottomColor: "#271b3d",
                  paddingBottom: 6,
                  marginBottom: 4,
                }}
              >
                <Text style={{ color: COLORS.muted, flex: 1, fontWeight: "900" }}>Team</Text>
                <Text style={{ color: COLORS.muted, width: 54, textAlign: "right", fontWeight: "900" }}>Left</Text>
                <Text style={{ color: COLORS.muted, width: 48, textAlign: "right", fontWeight: "900" }}>Open</Text>
                <Text style={{ color: COLORS.muted, width: 54, textAlign: "right", fontWeight: "900" }}>Max</Text>
                <Text style={{ color: COLORS.muted, width: 58, textAlign: "right", fontWeight: "900" }}>$ / spot</Text>
              </View>

              {teamData.map((team, index) => {
                const teamId = `team_${index + 1}`;
                const ineligible =
                  selectedPlayer !== null &&
                  !teamHasEligibleOpenSlot(
                    entriesForTeam(roster, teamId),
                    selectedPlayer,
                    league.rosterSlots,
                  );

                return (
                  <View
                    key={team.name}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: teamId === myTeamId ? "#2a1d43" : "transparent",
                      opacity: ineligible ? 0.5 : 1,
                      paddingVertical: 8,
                      paddingHorizontal: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: COLORS.text, flex: 1, fontWeight: "900" }}
                    >
                      {team.name}
                      {teamId === myTeamId ? " (You)" : ""}
                    </Text>
                    <Text style={{ color: COLORS.text, width: 54, textAlign: "right" }}>
                      {money(team.remaining)}
                    </Text>
                    <Text style={{ color: COLORS.text, width: 48, textAlign: "right" }}>
                      {team.open}
                    </Text>
                    <Text style={{ color: COLORS.text, width: 54, textAlign: "right" }}>
                      {money(team.maxBid)}
                    </Text>
                    <Text style={{ color: COLORS.text, width: 58, textAlign: "right" }}>
                      ${formatNumber(team.ppSpot, 1)}
                    </Text>
                  </View>
                );
              })}
            </Panel>

            {loadingMockPicks ? (
              <Panel>
                <LoadingState label="Loading mock picks..." />
              </Panel>
            ) : mockPredictions.length > 0 ? (
              <Panel>
                <SectionTitle title="Mock Pick Predictions" />
                {mockPredictions.slice(0, 5).map((prediction, index) => (
                  <View
                    key={`${prediction.team_id}-${prediction.pick_position}-${index}`}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#271b3d",
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      {teamNameFromId(prediction.team_id, league.teamNames)} · Pick{" "}
                      {prediction.pick_position}
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                      {prediction.predicted_player.name} · {prediction.predicted_player.position}
                    </Text>
                    <Text style={{ color: COLORS.dim, marginTop: 2 }}>
                      ADP {prediction.predicted_player.adp} · confidence{" "}
                      {Math.round(prediction.confidence * 100)}%
                    </Text>
                    <Text style={{ color: COLORS.dim, marginTop: 2 }}>
                      {prediction.predicted_player.reason}
                    </Text>
                    <View style={{ marginTop: 8, flexDirection: "row" }}>
                      <SmallButton
                        label="Open Player"
                        tone="primary"
                        onPress={() => openPlayerById(prediction.predicted_player.player_id)}
                      />
                    </View>
                  </View>
                ))}
              </Panel>
            ) : null}
          </>
        ) : null}

        {activeView === "Standings" ? (
          <Panel>
            <SectionTitle title="Projected Standings" right="Sortable on web" />
            <Text style={{ color: COLORS.muted, marginBottom: 10 }}>
              Lightweight projected roto standings from current rostered players.
            </Text>

            {projectedStandings.length === 0 ? (
              <EmptyState label="No standings data available yet." />
            ) : (
              projectedStandings.map((row, index) => (
                <View
                  key={row.teamId}
                  style={{
                    backgroundColor: row.teamId === myTeamId ? "#2a1d43" : COLORS.panel2,
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                    #{index + 1} {row.teamName}
                    {row.teamId === myTeamId ? " (You)" : ""}
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                    Total roto points: {row.totalPoints}
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                    {scoringCategories.map((category) => {
                      const cat = normalizeCatName(category.name);
                      const value = row.categoryValues[cat] ?? 0;
                      const points = row.categoryPoints[cat] ?? 0;

                      return (
                        <View
                          key={`${row.teamId}-${cat}`}
                          style={{
                            width: "50%",
                            paddingRight: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: "900" }}>
                            {cat}
                          </Text>
                          <Text style={{ color: COLORS.text }}>
                            {formatCategoryValue(cat, value)} · {points} pts
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </Panel>
        ) : null}

        {activeView === "Log" ? (
          <>
            <Panel>
              <SectionTitle
                title="Draft Log"
                right={`${recentPicks.length} ${recentPicks.length === 1 ? "pick" : "picks"}`}
              />

              {recentPicks.length === 0 ? (
                <Text style={{ color: COLORS.muted, textAlign: "center", paddingVertical: 18 }}>
                  No picks logged yet. Winning bids show up here in pick order.
                </Text>
              ) : (
                recentPicks.map((pick, index) => {
                  const isEditing = editingPickId === pick._id;
                  const isWorking = workingPickId === pick._id;

                  return (
                    <View
                      key={pick._id}
                      style={{
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: "#271b3d",
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                        #{index + 1} {pick.playerName}
                      </Text>
                      <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                        {teamNameFromId(pick.teamId, league.teamNames)} · {pick.rosterSlot} ·{" "}
                        {money(pick.price)}
                      </Text>

                      {isEditing ? (
                        <View style={{ marginTop: 10 }}>
                          <TextInput
                            value={editTeamNumber}
                            onChangeText={setEditTeamNumber}
                            placeholder={`Team 1-${league.teams}`}
                            keyboardType="numeric"
                            placeholderTextColor={COLORS.dim}
                            style={{
                              minHeight: 42,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                              backgroundColor: COLORS.page,
                              color: COLORS.text,
                              paddingHorizontal: 10,
                              marginBottom: 8,
                            }}
                          />
                          <TextInput
                            value={editPrice}
                            onChangeText={setEditPrice}
                            placeholder="Price"
                            keyboardType="numeric"
                            placeholderTextColor={COLORS.dim}
                            style={{
                              minHeight: 42,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                              backgroundColor: COLORS.page,
                              color: COLORS.text,
                              paddingHorizontal: 10,
                              marginBottom: 8,
                            }}
                          />
                          <TextInput
                            value={editSlot}
                            onChangeText={(value) => setEditSlot(value.toUpperCase())}
                            placeholder="Slot"
                            autoCapitalize="characters"
                            placeholderTextColor={COLORS.dim}
                            style={{
                              minHeight: 42,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                              backgroundColor: COLORS.page,
                              color: COLORS.text,
                              paddingHorizontal: 10,
                              marginBottom: 8,
                            }}
                          />

                          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                            <SmallButton
                              label={isWorking ? "Saving..." : "Save"}
                              tone="primary"
                              disabled={isWorking}
                              onPress={() => void handleSavePick(pick)}
                            />
                            <SmallButton
                              label="Cancel"
                              disabled={isWorking}
                              onPress={cancelEditingPick}
                            />
                            <SmallButton
                              label={isWorking ? "Deleting..." : "Delete"}
                              tone="danger"
                              disabled={isWorking}
                              onPress={() => void handleDeletePick(pick)}
                            />
                          </View>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                          <SmallButton
                            label="Open"
                            onPress={() => openPlayerById(pick.externalPlayerId)}
                          />
                          <SmallButton
                            label="Edit"
                            onPress={() => startEditingPick(pick)}
                          />
                          <SmallButton
                            label={isWorking ? "Deleting..." : "Delete"}
                            tone="danger"
                            disabled={isWorking}
                            onPress={() => void handleDeletePick(pick)}
                          />
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Panel>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

