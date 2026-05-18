import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { LeagueTabParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { Player } from "../types/player";

type Props = BottomTabScreenProps<LeagueTabParamList, "Overview">;

type EntryEdit = {
  price: string;
  rosterSlot: string;
  teamId: string;
  keeperContract: string;
};

type SlotRow = {
  position: string;
  playerName: string | null;
  playerTeam: string | null;
  price: number | null;
  isKeeper: boolean;
  keeperContract?: string;
};

type ReserveRow = {
  playerName: string;
  playerTeam: string | null;
  rosterSlot: string;
  price: number;
  isKeeper: boolean;
};

type TeamCardData = {
  teamId: string;
  teamName: string;
  slots: SlotRow[];
  rosterFilled: number;
  rosterTotal: number;
  spent: number;
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

type StandingRow = {
  teamName: string;
  stats: Record<string, number>;
};

type RotoSummary = {
  totalPoints: number;
  ranks: Record<string, number>;
  points: Record<string, number>;
};

const SLOT_ORDER = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "CI",
  "OF",
  "UTIL",
  "SP",
  "RP",
  "BN",
];

const FALLBACK_CATS: ScoringCategory[] = [
  { name: "R", type: "batting" },
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
  { name: "W", type: "pitching" },
  { name: "SV", type: "pitching" },
  { name: "K", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
];

const LOWER_IS_BETTER = new Set(["ERA", "WHIP"]);
const ROTO_POINTS_SORT_KEY = "PTS";

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
  return name.trim().toUpperCase();
}

function normalizePosition(position: string): string {
  return position.trim().toUpperCase();
}

function isReserveRosterSlot(rosterSlot: string | undefined | null): boolean {
  const slot = normalizePosition(rosterSlot ?? "");
  return slot.includes("MIN") || slot.includes("TAXI");
}

function isTaxiReserveEntry(entry: RosterEntry): boolean {
  const slot = normalizePosition(entry.rosterSlot ?? "");
  return slot.includes("TAXI") && !slot.includes("MIN");
}

function isMinorsReserveEntry(entry: RosterEntry): boolean {
  return normalizePosition(entry.rosterSlot ?? "").includes("MIN");
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

function orderedRosterSlots(rosterSlots: Record<string, number>): string[] {
  return [
    ...SLOT_ORDER.filter((pos) => rosterSlots[pos] !== undefined),
    ...Object.keys(rosterSlots).filter((pos) => !SLOT_ORDER.includes(pos)),
  ];
}

function sortRosterEntries(entries: RosterEntry[]): RosterEntry[] {
  const order = new Map(SLOT_ORDER.map((slot, index) => [slot, index]));

  return [...entries].sort((a, b) => {
    const aSlot = normalizePosition(a.rosterSlot);
    const bSlot = normalizePosition(b.rosterSlot);
    const aIndex = order.get(aSlot) ?? 999;
    const bIndex = order.get(bSlot) ?? 999;

    if (aIndex !== bIndex) return aIndex - bIndex;

    const slotCompare = aSlot.localeCompare(bSlot);
    if (slotCompare !== 0) return slotCompare;

    return a.playerName.localeCompare(b.playerName);
  });
}

function sortDraftLog(entries: RosterEntry[]): RosterEntry[] {
  return [...entries].sort((a, b) => {
    const at = new Date(a.acquiredAt ?? a.createdAt).getTime();
    const bt = new Date(b.acquiredAt ?? b.createdAt).getTime();

    return at - bt;
  });
}

function buildReserveRow(entry: RosterEntry): ReserveRow {
  return {
    playerName: entry.playerName,
    playerTeam: formatMlbTeam(entry.playerTeam),
    rosterSlot: entry.rosterSlot,
    price: entry.price,
    isKeeper: entry.isKeeper,
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
  const activeEntries = sortRosterEntries(teamEntries.filter(isActiveAuctionEntry));
  const reserveEntries = teamEntries.filter(isReserveEntry);
  const orderedPositions = orderedRosterSlots(rosterSlots);
  const usedIds = new Set<string>();
  const slots: SlotRow[] = [];

  for (const position of orderedPositions) {
    const count = rosterSlots[position] ?? 0;
    const entriesAtSlot = activeEntries.filter(
      (entry) =>
        normalizePosition(entry.rosterSlot) === normalizePosition(position) &&
        !usedIds.has(entry._id),
    );

    for (let i = 0; i < count; i++) {
      const entry = entriesAtSlot[i];

      if (entry) {
        usedIds.add(entry._id);
      }

      slots.push({
        position,
        playerName: entry?.playerName ?? null,
        playerTeam: formatMlbTeam(entry?.playerTeam),
        price: entry?.price ?? null,
        isKeeper: entry?.isKeeper ?? false,
        keeperContract: entry?.keeperContract,
      });
    }
  }

  const unassignedActive = activeEntries.filter((entry) => !usedIds.has(entry._id));

  for (const entry of unassignedActive) {
    slots.push({
      position: entry.rosterSlot,
      playerName: entry.playerName,
      playerTeam: formatMlbTeam(entry.playerTeam),
      price: entry.price,
      isKeeper: entry.isKeeper,
      keeperContract: entry.keeperContract,
    });
  }

  const rosterFilled = slots.filter((slot) => slot.playerName !== null).length;
  const rosterTotal = orderedPositions.reduce(
    (sum, position) => sum + (rosterSlots[position] ?? 0),
    0,
  );
  const spent = activeEntries.reduce((sum, entry) => sum + entry.price, 0);
  const budgetRemaining = Math.max(0, budget - spent);
  const open = Math.max(0, rosterTotal - rosterFilled);

  const minors = reserveEntries
    .filter(isMinorsReserveEntry)
    .map(buildReserveRow);

  const taxi = reserveEntries
    .filter(isTaxiReserveEntry)
    .map(buildReserveRow);

  const otherReserves = reserveEntries
    .filter((entry) => !isMinorsReserveEntry(entry) && !isTaxiReserveEntry(entry))
    .map(buildReserveRow);

  return {
    teamId,
    teamName,
    slots,
    rosterFilled,
    rosterTotal,
    spent,
    budgetRemaining,
    bidAvg: open > 0 ? Math.round(budgetRemaining / open) : 0,
    maxBid: open > 0 ? Math.max(1, budgetRemaining - (open - 1)) : 0,
    minors,
    taxi,
    otherReserves,
  };
}

function playerKeyCandidates(player: Player): string[] {
  const keys: string[] = [];

  function push(value: unknown) {
    if (value === undefined || value === null) return;

    const text = String(value).trim();

    if (!text) return;
    if (!keys.includes(text)) keys.push(text);
  }

  push(player.id);
  push(player.mlbId);

  return keys;
}

function buildPlayerMap(players: Player[]): Map<string, Player> {
  const map = new Map<string, Player>();

  for (const player of players) {
    for (const key of playerKeyCandidates(player)) {
      map.set(key, player);
    }
  }

  return map;
}

function numberFromUnknown(value: unknown): number | null {
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

function playerStat(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const cat = normalizeCatName(catName);
  const data = player as unknown as {
    stats?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
    projection?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
  };

  const source =
    catType === "batting"
      ? data.projection?.batting ?? data.stats?.batting
      : data.projection?.pitching ?? data.stats?.pitching;

  if (!source) return 0;

  const aliases: Record<string, string[]> = {
    R: ["runs", "r"],
    HR: ["hr", "homeRuns"],
    RBI: ["rbi"],
    SB: ["sb", "stolenBases"],
    AVG: ["avg"],
    OBP: ["obp"],
    SLG: ["slg"],
    TB: ["tb", "totalBases"],
    H: ["hits", "h"],
    BB: ["walks", "bb"],
    W: ["wins", "w"],
    K: ["strikeouts", "k", "so"],
    ERA: ["era"],
    WHIP: ["whip"],
    SV: ["saves", "sv"],
    HLD: ["holds", "hld"],
    IP: ["innings", "ip"],
    CG: ["completeGames", "cg"],
  };

  const keys = aliases[cat] ?? [cat.toLowerCase()];

  for (const key of keys) {
    const parsed = numberFromUnknown(source[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return 0;
}

function buildProjectedStandings(
  teamNames: string[],
  entries: RosterEntry[],
  playerMap: Map<string, Player>,
  scoringCats: ScoringCategory[],
): StandingRow[] {
  return teamNames.map((teamName, index) => {
    const teamId = teamIdFromIndex(index);
    const teamPlayers = entries
      .filter((entry) => entry.teamId === teamId)
      .map((entry) => playerMap.get(String(entry.externalPlayerId)))
      .filter((player): player is Player => Boolean(player));

    const stats: Record<string, number> = {};

    for (const cat of scoringCats) {
      const catName = normalizeCatName(cat.name);

      if (
        catName === "AVG" ||
        catName === "OBP" ||
        catName === "SLG" ||
        catName === "ERA" ||
        catName === "WHIP"
      ) {
        const values = teamPlayers
          .map((player) => playerStat(player, catName, cat.type))
          .filter((value) => value > 0);

        stats[catName] =
          values.length > 0
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0;
      } else {
        stats[catName] = teamPlayers.reduce(
          (sum, player) => sum + playerStat(player, catName, cat.type),
          0,
        );
      }
    }

    return { teamName, stats };
  });
}

function formatStatCell(cat: string, value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";

  const normalized = normalizeCatName(cat);

  if (normalized === "AVG" || normalized === "OBP" || normalized === "SLG") {
    return value.toFixed(3);
  }

  if (normalized === "ERA" || normalized === "WHIP") {
    return value.toFixed(2);
  }

  return String(Math.round(value));
}

function rankColor(rank: number, teamCount: number): string {
  if (rank <= Math.max(1, Math.ceil(teamCount * 0.25))) return colors.green;
  if (rank >= Math.max(1, Math.floor(teamCount * 0.75))) return "#fb7185";
  return colors.gold;
}

function isEmptyStatValue(value: number): boolean {
  return !Number.isFinite(value) || value === 0;
}

function compareCategoryValues(cat: string, a: number, b: number): number {
  const lowerIsBetter = LOWER_IS_BETTER.has(normalizeCatName(cat));

  if (lowerIsBetter) {
    if (a === 0 && b === 0) return 0;
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  }

  return b - a;
}

function computeRankMaps(
  standings: StandingRow[],
  catNames: string[],
): Record<string, Map<string, { rank: number; points: number }>> {
  const output: Record<string, Map<string, { rank: number; points: number }>> = {};
  const teamCount = standings.length;

  for (const cat of catNames) {
    const sorted = [...standings].sort((a, b) =>
      compareCategoryValues(cat, a.stats[cat] ?? 0, b.stats[cat] ?? 0),
    );

    const map = new Map<string, { rank: number; points: number }>();

    sorted.forEach((row, index) => {
      const value = row.stats[cat] ?? 0;
      const rank = index + 1;
      const points = isEmptyStatValue(value)
        ? 0
        : Math.max(1, teamCount - index);

      map.set(row.teamName, { rank, points });
    });

    output[cat] = map;
  }

  return output;
}

function computeRotoSummaries(
  teamNames: string[],
  catNames: string[],
  rankMaps: Record<string, Map<string, { rank: number; points: number }>>,
): Map<string, RotoSummary> {
  const summaries = new Map<string, RotoSummary>();

  for (const teamName of teamNames) {
    const ranks: Record<string, number> = {};
    const points: Record<string, number> = {};
    let totalPoints = 0;

    for (const cat of catNames) {
      const row = rankMaps[cat]?.get(teamName);
      const categoryRank = row?.rank ?? teamNames.length;
      const categoryPoints = row?.points ?? 0;

      ranks[cat] = categoryRank;
      points[cat] = categoryPoints;
      totalPoints += categoryPoints;
    }

    summaries.set(teamName, {
      totalPoints,
      ranks,
      points,
    });
  }

  return summaries;
}

function compareStandingRows(
  a: StandingRow,
  b: StandingRow,
  sortCat: string,
  sortAsc: boolean,
  summaries: Map<string, RotoSummary>,
): number {
  if (sortCat === ROTO_POINTS_SORT_KEY) {
    const av = summaries.get(a.teamName)?.totalPoints ?? 0;
    const bv = summaries.get(b.teamName)?.totalPoints ?? 0;
    const diff = bv - av;

    return sortAsc ? -diff : diff;
  }

  const diff = compareCategoryValues(
    sortCat,
    a.stats[sortCat] ?? 0,
    b.stats[sortCat] ?? 0,
  );

  return sortAsc ? -diff : diff;
}

function TeamStatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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

function PositionBadge({ label }: { label: string }) {
  return (
    <View
      style={{
        minWidth: 34,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#5b3a89",
        backgroundColor: "#2c1a47",
        paddingVertical: 3,
        paddingHorizontal: 6,
        marginRight: 8,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#f4e9ff", fontSize: 11, fontWeight: "900" }}>
        {label}
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

      {slot.price !== null ? (
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
}: {
  minors: ReserveRow[];
  taxi: ReserveRow[];
  otherReserves: ReserveRow[];
}) {
  const total = minors.length + taxi.length + otherReserves.length;

  if (total === 0) {
    return (
      <Text style={{ color: colors.muted, marginTop: 8 }}>
        Minors 0 · Taxi 0
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: colors.muted, fontWeight: "800" }}>
        Minors {minors.length} · Taxi {taxi.length}
        {otherReserves.length > 0 ? ` · Reserves ${otherReserves.length}` : ""}
      </Text>
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
  const [selectedTeamId, setSelectedTeamId] = useState("team_1");
  const [edits, setEdits] = useState<Record<string, EntryEdit>>({});
  const [sortCat, setSortCat] = useState(ROTO_POINTS_SORT_KEY);
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(() => getRosterCached(leagueId) === null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showSelectedReserves, setShowSelectedReserves] = useState(false);

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

  useEffect(() => {
    if (teamNames.length === 0) {
      setSelectedTeamId("");
      return;
    }

    setSelectedTeamId((previous) => {
      if (previous) {
        const index = Number.parseInt(previous.replace("team_", ""), 10) - 1;

        if (index >= 0 && index < teamNames.length) {
          return previous;
        }
      }

      return "team_1";
    });
  }, [teamNames.length]);

  const rosterSlotOptions = useMemo(() => {
    return orderedRosterSlots(league?.rosterSlots ?? {});
  }, [league]);

  const activeEntries = useMemo(() => {
    return entries.filter(isActiveAuctionEntry);
  }, [entries]);

  const reserveEntries = useMemo(() => {
    return entries.filter(isReserveEntry);
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

  const selectedTeamCard = useMemo(() => {
    return teamCards.find((team) => team.teamId === selectedTeamId) ?? teamCards[0] ?? null;
  }, [teamCards, selectedTeamId]);

  const totalActiveSpent = useMemo(() => {
    return activeEntries.reduce((sum, entry) => sum + entry.price, 0);
  }, [activeEntries]);

  const selectedTeamActiveEntries = useMemo(() => {
    return sortRosterEntries(
      activeEntries.filter((entry) => entry.teamId === selectedTeamId),
    );
  }, [activeEntries, selectedTeamId]);

  const selectedTeamReserveEntries = useMemo(() => {
    return sortRosterEntries(
      reserveEntries.filter((entry) => entry.teamId === selectedTeamId),
    );
  }, [reserveEntries, selectedTeamId]);

  const playerMap = useMemo(() => {
    return buildPlayerMap(allPlayers);
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

  const allCatNames = useMemo(() => {
    return scoringCats.map((cat) => cat.name);
  }, [scoringCats]);

  const standings = useMemo(() => {
    return buildProjectedStandings(teamNames, activeEntries, playerMap, scoringCats);
  }, [teamNames, activeEntries, playerMap, scoringCats]);

  const rankMaps = useMemo(() => {
    return computeRankMaps(standings, allCatNames);
  }, [standings, allCatNames]);

  const rotoSummaries = useMemo(() => {
    return computeRotoSummaries(teamNames, allCatNames, rankMaps);
  }, [teamNames, allCatNames, rankMaps]);

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

  function toggleSort(cat: string) {
    if (cat === sortCat) {
      setSortAsc((value) => !value);
    } else {
      setSortCat(cat);
      setSortAsc(false);
    }
  }

  function getEdit(entry: RosterEntry): EntryEdit {
    return (
      edits[entry._id] ?? {
        price: String(entry.price),
        rosterSlot: entry.rosterSlot,
        teamId: entry.teamId,
        keeperContract: entry.keeperContract ?? "",
      }
    );
  }

  function updateEdit(entryId: string, patch: Partial<EntryEdit>) {
    setEdits((current) => {
      const entry = entries.find((item) => item._id === entryId);

      if (!entry) return current;

      const previous =
        current[entryId] ?? {
          price: String(entry.price),
          rosterSlot: entry.rosterSlot,
          teamId: entry.teamId,
          keeperContract: entry.keeperContract ?? "",
        };

      return {
        ...current,
        [entryId]: {
          ...previous,
          ...patch,
        },
      };
    });
  }

  async function handleSaveEntry(entry: RosterEntry) {
    if (!token || !league) return;

    const edit = getEdit(entry);
    const parsedPrice = Number.parseInt(edit.price, 10);

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      Alert.alert("Invalid price", "Price must be at least $0.");
      return;
    }

    if (!edit.rosterSlot.trim()) {
      Alert.alert("Invalid roster slot", "Roster slot cannot be empty.");
      return;
    }

    setSavingEntryId(entry._id);

    try {
      const updated = await updateRosterEntry(
        league.id,
        entry._id,
        {
          price: parsedPrice,
          rosterSlot: edit.rosterSlot.trim().toUpperCase(),
          teamId: edit.teamId,
          keeperContract: edit.keeperContract.trim() || undefined,
        },
        token,
      );

      setEntries((current) =>
        current.map((item) => (item._id === entry._id ? updated : item)),
      );

      setEdits((current) => {
        const next = { ...current };
        delete next[entry._id];
        return next;
      });
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save this roster entry.",
      );
    } finally {
      setSavingEntryId(null);
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

  function renderEditableEntry(entry: RosterEntry) {
    const edit = getEdit(entry);
    const isSaving = savingEntryId === entry._id;

    return (
      <View
        key={entry._id}
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
          {entry.playerName}
        </Text>

        <Text style={{ color: colors.muted, marginTop: 2 }}>
          {formatMlbTeam(entry.playerTeam) || "FA"} • {(entry.positions ?? []).join("/") || entry.rosterSlot}
          {entry.isKeeper ? " • Keeper" : ""}
          {entry.keeperContract ? ` • ${entry.keeperContract}` : ""}
        </Text>

        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Price</Text>
            <TextInput
              value={edit.price}
              keyboardType="number-pad"
              onChangeText={(value) => updateEdit(entry._id, { price: value })}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
                borderRadius: 8,
                padding: 10,
              }}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Contract</Text>
            <TextInput
              value={edit.keeperContract}
              onChangeText={(value) =>
                updateEdit(entry._id, { keeperContract: value })
              }
              placeholder="Arb / 3Y"
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.text,
                borderRadius: 8,
                padding: 10,
              }}
            />
          </View>
        </View>

        <Text style={{ color: colors.muted, marginTop: 10 }}>Slot</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {[...rosterSlotOptions, "MIN", "TAXI"].map((slot) => (
            <AppChip
              key={slot}
              label={slot}
              selected={edit.rosterSlot === slot}
              onPress={() => updateEdit(entry._id, { rosterSlot: slot })}
              style={{ marginRight: 8 }}
            />
          ))}
        </ScrollView>

        <Text style={{ color: colors.muted, marginTop: 10 }}>Move to team</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {teamNames.map((teamName, index) => {
            const teamId = teamIdFromIndex(index);

            return (
              <AppChip
                key={teamId}
                label={teamName}
                selected={edit.teamId === teamId}
                onPress={() => updateEdit(entry._id, { teamId })}
                style={{ marginRight: 8 }}
              />
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <DraftButton
            label={isSaving ? "Saving..." : "Save"}
            onPress={() => void handleSaveEntry(entry)}
          />

          <DraftButton
            label="Remove"
            tone="danger"
            onPress={() => handleRemoveEntry(entry)}
          />
        </View>
      </View>
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  const selectedTeamName = teamNameFromId(selectedTeamId, teamNames);
  const selectedTeamRemaining = selectedTeamCard?.budgetRemaining ?? league.budget;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
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
                  <TouchableOpacity
                    key={team.teamId}
                    activeOpacity={0.86}
                    onPress={() => {
                      setSelectedTeamId(team.teamId);
                      setShowSelectedReserves(false);
                    }}
                    style={{
                      width: 278,
                      borderWidth: 1,
                      borderColor:
                        selectedTeamId === team.teamId ? colors.purple2 : colors.border,
                      borderRadius: 16,
                      padding: 12,
                      marginRight: 12,
                      backgroundColor:
                        selectedTeamId === team.teamId ? colors.surface2 : colors.surface,
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
                      {team.slots.slice(0, 13).map((slot, index) => (
                        <FilledSlotRow
                          key={`${team.teamId}-${slot.position}-${index}`}
                          slot={slot}
                        />
                      ))}

                      {team.slots.length > 13 ? (
                        <Text style={{ color: colors.muted, marginTop: 6 }}>
                          +{team.slots.length - 13} more active slots
                        </Text>
                      ) : null}
                    </View>

                    <ReserveSummary
                      minors={team.minors}
                      taxi={team.taxi}
                      otherReserves={team.otherReserves}
                    />

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedTeamId(team.teamId);
                        setShowSelectedReserves(true);
                      }}
                      style={{
                        marginTop: 10,
                        borderWidth: 1,
                        borderColor: "#6d3fb8",
                        backgroundColor: "#2a1845",
                        borderRadius: 8,
                        paddingVertical: 8,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#e9d5ff", fontWeight: "900", fontSize: 12 }}>
                        VIEW ROSTER
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
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
                {[ROTO_POINTS_SORT_KEY, ...allCatNames].map((cat) => (
                  <AppChip
                    key={cat}
                    label={`${cat === ROTO_POINTS_SORT_KEY ? "Pts" : cat}${
                      sortCat === cat ? (sortAsc ? " ↑" : " ↓") : ""
                    }`}
                    selected={sortCat === cat}
                    onPress={() => toggleSort(cat)}
                    style={{ marginRight: 8 }}
                  />
                ))}
              </ScrollView>

              {sortedStandings.map((row, index) => {
                const summary = rotoSummaries.get(row.teamName);
                const sortValue =
                  sortCat === ROTO_POINTS_SORT_KEY
                    ? summary?.totalPoints ?? 0
                    : row.stats[sortCat] ?? 0;
                const sortRank =
                  sortCat === ROTO_POINTS_SORT_KEY
                    ? index + 1
                    : summary?.ranks[sortCat] ?? index + 1;

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
                        : `${sortCat}: ${formatStatCell(sortCat, sortValue)} · rank #${sortRank}`}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      {allCatNames.map((cat) => {
                        const value = row.stats[cat] ?? 0;
                        const rank = summary?.ranks[cat] ?? 0;
                        const points = summary?.points[cat] ?? 0;
                        const empty = isEmptyStatValue(value);

                        return (
                          <Text
                            key={cat}
                            style={{
                              width: "50%",
                              color: cat === sortCat ? colors.gold : colors.muted,
                              fontSize: 12,
                              marginBottom: 4,
                            }}
                          >
                            <Text style={{ fontWeight: "900" }}>{cat}</Text>{" "}
                            <Text
                              style={{
                                color: empty ? colors.muted : rankColor(rank, teamNames.length),
                              }}
                            >
                              {formatStatCell(cat, value)}
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
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 4,
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
                    {selectedTeamName} Roster
                  </Text>

                  <Text style={{ color: colors.muted, marginTop: 4 }}>
                    Active {selectedTeamCard?.rosterFilled ?? 0}/{selectedTeamCard?.rosterTotal ?? 0}
                    {" · "}
                    Minors {selectedTeamCard?.minors.length ?? 0}
                    {" · "}
                    Taxi {selectedTeamCard?.taxi.length ?? 0}
                    {" · "}
                    {formatMoney(selectedTeamRemaining)} remaining
                  </Text>
                </View>

                <AppChip
                  label={showSelectedReserves ? "Active" : "Reserves"}
                  selected
                  onPress={() => setShowSelectedReserves((value) => !value)}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
                {teamNames.map((teamName, index) => {
                  const teamId = teamIdFromIndex(index);

                  return (
                    <AppChip
                      key={teamId}
                      label={teamName}
                      selected={selectedTeamId === teamId}
                      onPress={() => {
                        setSelectedTeamId(teamId);
                        setShowSelectedReserves(false);
                      }}
                      style={{ marginRight: 8 }}
                    />
                  );
                })}
              </ScrollView>

              {showSelectedReserves ? (
                selectedTeamReserveEntries.length === 0 ? (
                  <EmptyState label="No reserve, minors, or taxi players for this team." />
                ) : (
                  selectedTeamReserveEntries.map(renderEditableEntry)
                )
              ) : selectedTeamActiveEntries.length === 0 ? (
                <EmptyState label="No active players on this team yet." />
              ) : (
                selectedTeamActiveEntries.map(renderEditableEntry)
              )}
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

                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          {formatMlbTeam(entry.playerTeam) || "FA"} ·{" "}
                          {teamNameFromId(entry.teamId, teamNames)} ·{" "}
                          {entry.rosterSlot} · {formatMoney(entry.price)}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", marginTop: 8 }}>
                      <DraftButton
                        label="Edit in roster"
                        onPress={() => {
                          setSelectedTeamId(entry.teamId);
                          setShowSelectedReserves(false);
                        }}
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
    </SafeAreaView>
  );
}
