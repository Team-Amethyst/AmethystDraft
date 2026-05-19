import { useEffect, useMemo, useState } from "react";
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
import type { EngineCheckpointCatalogEntry } from "../api/checkpoints";
import {
  fetchEngineCheckpointCatalog,
  fetchEngineCheckpointJson,
} from "../api/checkpoints";
import { getValuation, type ValuationResult } from "../api/engine";
import { getPlayers, getPlayersCached } from "../api/players";
import { getRoster, type RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";
import type { EngineCheckpointKey } from "../api/leagues";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import PositionBadge from "../components/ui/PositionBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { buildRosterDraftMaps, resolvePlayerDraftState } from "../domain/draftState";
import { planMockDraftFromCheckpointJson } from "../domain/checkpointMockDraft";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import { POSITION_PLAN, useDraftPlan, type Priority } from "../hooks/useDraftPlan";
import { useMockDraft } from "../hooks/useMockDraft";
import type { LeagueTabParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { Player } from "../types/player";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";

type Props = BottomTabScreenProps<LeagueTabParamList, "MyDraft">;

type ScreenMode = "plan" | "mock";
type ViewFilter = "all" | "hitters" | "pitchers";
type ValuationSortField =
  | "auction_value"
  | "team_value"
  | "recommended_bid"
  | "baseline_value";

type WatchlistRow = WatchlistPlayer & {
  bucket: string;
  target: number;
  priority: Priority;
  primaryValue: number;
  supportingValue: number;
  draftedLabel: string;
  isDrafted: boolean;
};

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

function watchlistToPlayer(p: WatchlistPlayer): Player {
  return {
    id: p.id,
    mlbId: 0,
    name: p.name,
    team: p.team,
    position: p.position,
    positions: p.positions,
    age: 0,
    adp: p.adp,
    value: p.team_value ?? p.recommended_bid ?? p.auction_value ?? p.value ?? 0,
    tier: p.catalog_tier ?? p.tier ?? 5,
    headshot: "",
    outlook: "",
    stats: {},
    projection: {},
  };
}

function isPitcher(player: WatchlistPlayer | Player): boolean {
  const direct = (player.position ?? "").toUpperCase();
  const multi = (player.positions ?? []).map((p) => p.toUpperCase());

  return (
    direct.includes("SP") ||
    direct.includes("RP") ||
    direct === "P" ||
    multi.includes("SP") ||
    multi.includes("RP") ||
    multi.includes("P")
  );
}

function getPositionBucket(player: WatchlistPlayer): string {
  const positions = (player.positions ?? [player.position]).map((p) =>
    p.toUpperCase(),
  );

  if (positions.includes("C")) return "C";
  if (positions.includes("1B")) return "1B";
  if (positions.includes("2B")) return "2B";
  if (positions.includes("SS")) return "SS";
  if (positions.includes("3B")) return "3B";

  if (
    positions.includes("OF") ||
    positions.includes("LF") ||
    positions.includes("CF") ||
    positions.includes("RF")
  ) {
    return "OF";
  }

  if (positions.includes("SP")) return "SP";
  if (positions.includes("RP")) return "RP";
  if (positions.includes("UTIL") || positions.includes("UT")) return "UTIL";

  return isPitcher(player) ? "SP" : "UTIL";
}

function getNumericValue(source: unknown, key: string): number | undefined {
  const data = source as Record<string, unknown> | undefined;
  const raw = data?.[key];

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number(raw);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function mergeWatchlistPlayerWithValuation(
  player: WatchlistPlayer,
  valuation: ValuationResult | undefined,
): WatchlistPlayer {
  if (!valuation) return player;

  return {
    ...player,
    baseline_value:
      getNumericValue(valuation, "baseline_value") ?? player.baseline_value,
    auction_value:
      getNumericValue(valuation, "auction_value") ?? player.auction_value,
    recommended_bid:
      getNumericValue(valuation, "recommended_bid") ?? player.recommended_bid,
    team_value:
      getNumericValue(valuation, "team_value") ?? player.team_value,
    tier: getNumericValue(valuation, "tier") ?? player.tier,
    catalog_tier:
      getNumericValue(valuation, "catalog_tier") ?? player.catalog_tier,
  };
}

function resolveValuationNumber(
  player: WatchlistPlayer,
  field: ValuationSortField,
): number {
  const direct = getNumericValue(player, field);

  if (direct !== undefined) {
    return direct;
  }

  const fallbackKeys = [
    "team_value",
    "recommended_bid",
    "auction_value",
    "baseline_value",
    "value",
  ];

  for (const key of fallbackKeys) {
    const value = getNumericValue(player, key);

    if (value !== undefined) {
      return value;
    }
  }

  return 0;
}

function valuationLabel(field: ValuationSortField): string {
  if (field === "auction_value") return "Auction Value";
  if (field === "team_value") return "Your team value";
  if (field === "recommended_bid") return "Suggested bid";
  return "Baseline Strength";
}

function supportingFieldFor(field: ValuationSortField): ValuationSortField {
  if (field === "team_value") return "recommended_bid";
  if (field === "recommended_bid") return "team_value";
  if (field === "auction_value") return "team_value";
  return "auction_value";
}

function derivePriority(player: WatchlistPlayer): Priority {
  const decisionValue = resolveValuationNumber(player, "team_value");
  const tier = player.catalog_tier ?? player.tier;

  if (decisionValue >= 45 || tier <= 2) return "High";
  if (decisionValue >= 28 || tier === 3) return "Medium";
  return "Low";
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${Math.round(value)}`;
}

function formatSignedMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";

  const rounded = Math.round(value);

  if (rounded > 0) return `+$${rounded}`;
  if (rounded < 0) return `-$${Math.abs(rounded)}`;
  return "$0";
}

function checkpointDisplayLabel(
  checkpoint: EngineCheckpointCatalogEntry | undefined,
  key: string,
): string {
  if (key === "") return "— Fresh draft —";

  if (checkpoint?.title?.trim()) {
    return checkpoint.title.trim();
  }

  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function playerSearch(players: Player[], query: string): Player[] {
  const q = query.toLowerCase().trim();

  if (q.length < 2) return [];

  return players
    .filter((player) => {
      const name = player.name.toLowerCase();
      const team = player.team.toLowerCase();
      const positionText = [player.position, ...(player.positions ?? [])]
        .join("/")
        .toLowerCase();

      return name.includes(q) || team.includes(q) || positionText.includes(q);
    })
    .sort((a, b) => {
      const adpA = typeof a.adp === "number" ? a.adp : 9999;
      const adpB = typeof b.adp === "number" ? b.adp : 9999;

      if (adpA !== adpB) return adpA - adpB;

      return (b.value ?? 0) - (a.value ?? 0);
    })
    .slice(0, 12);
}

function SectionHeader({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: "900",
        }}
      >
        {title}
      </Text>

      {meta ? (
        <Text style={{ color: colors.muted, marginTop: 3 }}>{meta}</Text>
      ) : null}
    </View>
  );
}

function MetricPill({
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
        flex: 1,
        minWidth: 92,
        borderWidth: 1,
        borderColor: highlight ? "#6d3fb8" : colors.border,
        backgroundColor: highlight ? "#2a1845" : colors.surface2,
        borderRadius: 12,
        padding: 10,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          color: colors.muted,
          fontSize: 10,
          fontWeight: "900",
          letterSpacing: 0.7,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: highlight ? "#f5eaff" : colors.text,
          fontWeight: "900",
          fontSize: 18,
          marginTop: 3,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function AllocationBar({
  rows,
  totalBudget,
  plannedRemaining,
}: {
  rows: Array<{ pos: string; slots: number; target: number; color: string }>;
  totalBudget: number;
  plannedRemaining: number;
}) {
  return (
    <>
      <View
        style={{
          height: 22,
          borderRadius: 6,
          overflow: "hidden",
          flexDirection: "row",
          backgroundColor: "#211731",
          borderWidth: 1,
          borderColor: "#33244c",
          marginBottom: 10,
        }}
      >
        {rows.map((row) => {
          const widthPct =
            totalBudget > 0 ? Math.max(0, (row.target / totalBudget) * 100) : 0;

          return (
            <View
              key={row.pos}
              style={{
                width: `${Math.min(widthPct, 100)}%`,
                backgroundColor: row.color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {widthPct >= 7 ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: "#111827",
                    fontSize: 9,
                    fontWeight: "900",
                  }}
                >
                  {row.pos}
                </Text>
              ) : null}
            </View>
          );
        })}

        {plannedRemaining > 0 ? (
          <View
            style={{
              width: `${Math.max(0, (plannedRemaining / totalBudget) * 100)}%`,
              backgroundColor: "#3f3750",
            }}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {rows.map((row) => (
          <View
            key={row.pos}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 10,
              marginBottom: 6,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: row.color,
                marginRight: 5,
              }}
            />
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {row.pos} {formatMoney(row.target)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

export default function MyDraftScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();
  const { customPlayers } = useCustomPlayers();
  const { setSelectedPlayer } = useSelectedPlayer();
  const { getWatchlistForLeague, loadWatchlist, removeFromWatchlist } =
    useWatchlist();
  const { getNote, setNote, loadNotes } = usePlayerNotes();

  const league = useMemo(
    () => allLeagues.find((item) => item.id === leagueId) ?? null,
    [allLeagues, leagueId],
  );

  const watchlist = getWatchlistForLeague(leagueId);
  const totalBudget = league?.budget ?? 260;

  const {
    positionTargets,
    targetOverrides,
    priorityOverrides,
    setPositionTargets,
    setTargetOverrides,
    setPriorityOverrides,
    allocationRows,
  } = useDraftPlan(leagueId);

  const [screenMode, setScreenMode] = useState<ScreenMode>("plan");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [valuationSortField, setValuationSortField] =
    useState<ValuationSortField>("auction_value");
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationResult>
  >(new Map());
  const [valuationStatus, setValuationStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [valuationError, setValuationError] = useState("");
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mockSearchQuery, setMockSearchQuery] = useState("");
  const [bidRaw, setBidRaw] = useState("2");
  const [checkpointCatalog, setCheckpointCatalog] = useState<
    EngineCheckpointCatalogEntry[]
  >([]);
  const [selectedCheckpointKey, setSelectedCheckpointKey] = useState<
    "" | EngineCheckpointKey
  >("");
  const [checkpointCatalogPhase, setCheckpointCatalogPhase] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [checkpointCatalogError, setCheckpointCatalogError] = useState("");
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointError, setCheckpointError] = useState("");

  useEffect(() => {
    if (!token) {
      setCheckpointCatalog([]);
      setSelectedCheckpointKey("");
      setCheckpointCatalogPhase("idle");
      setCheckpointCatalogError("");
      return;
    }

    let active = true;

    setCheckpointCatalogPhase("loading");
    setCheckpointCatalogError("");

    void fetchEngineCheckpointCatalog(token)
      .then((catalog) => {
        if (!active) return;
        setCheckpointCatalog(catalog);
        setCheckpointCatalogPhase("ready");
        setCheckpointCatalogError("");
      })
      .catch((err) => {
        if (!active) return;
        setCheckpointCatalog([]);
        setCheckpointCatalogPhase("error");
        setCheckpointCatalogError(
          err instanceof Error
            ? err.message
            : "Unable to load Engine checkpoint catalog.",
        );
      });

    return () => {
      active = false;
    };
  }, [token]);

  const teamNames = useMemo(() => {
    if (!league) return [];
    return safeTeamNames(league.teams, league.teamNames);
  }, [league]);

  const draftMaps = useMemo(
    () => buildRosterDraftMaps(rosterEntries, teamNames),
    [rosterEntries, teamNames],
  );

  const allPlayers = useMemo(
    () => [...customPlayers, ...players],
    [customPlayers, players],
  );

  const watchlistPlayers = useMemo(
    () => watchlist.map(watchlistToPlayer),
    [watchlist],
  );

  const {
    state,
    storageLoaded,
    hasSavedDraft,
    startDraft,
    resetDraft,
    hydrateFromCheckpoint,
    nominatePlayer,
    placeBid,
    keepBidding,
    confirmSell,
    currentTeamIdx,
    isUserTurn,
  } = useMockDraft(
    leagueId,
    teamNames,
    league?.budget ?? 260,
    league?.rosterSlots ?? {},
    allPlayers,
    watchlistPlayers,
  );

  const currentTeam = state.rosters[currentTeamIdx];
  const userRoster = state.rosters.find((roster) => roster.isUser);
  const userRemaining = userRoster
    ? Math.max(0, userRoster.budget - userRoster.spent)
    : totalBudget;

  const mockSearchResults = useMemo(
    () => playerSearch(state.undraftedPlayers, mockSearchQuery),
    [state.undraftedPlayers, mockSearchQuery],
  );

  const loadData = async (mode: "load" | "refresh" = "load") => {
    if (!token || !league) return;

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoadingPlayers(true);
    }

    const cachedPlayers = getPlayersCached(
      "adp",
      league.posEligibilityThreshold,
      league.playerPool,
    );

    if (cachedPlayers) {
      setPlayers(cachedPlayers);
    }

    try {
      const [roster, fetchedPlayers] = await Promise.all([
        getRoster(league.id, token),
        getPlayers("adp", league.posEligibilityThreshold, league.playerPool),
        loadWatchlist(league.id),
        loadNotes(league.id),
      ]);

      setRosterEntries(roster);
      setPlayers(fetchedPlayers);
    } catch (err) {
      setValuationError(
        err instanceof Error ? err.message : "Failed to load My Draft data.",
      );
    } finally {
      setLoadingPlayers(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData("load");
  }, [league?.id, token]);

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
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  const watchlistRequestKey = useMemo(() => {
    return watchlist
      .map((player) => player.id)
      .sort()
      .join("\u0001");
  }, [watchlist]);

  useEffect(() => {
    if (!token || watchlist.length === 0) {
      setValuationsByPlayerId(new Map());
      setValuationStatus("idle");
      setValuationError("");
      return;
    }

    let cancelled = false;

    setValuationStatus("loading");
    setValuationError("");

    void getValuation(leagueId, token, "team_1", {
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationKey,
    })
      .then((response) => {
        if (cancelled) return;

        const next = new Map<string, ValuationResult>();

        for (const row of response.valuations) {
          next.set(row.player_id, row);
        }

        setValuationsByPlayerId(next);
        setValuationStatus("ready");
        setValuationError("");
      })
      .catch((err) => {
        if (cancelled) return;

        setValuationsByPlayerId(new Map());
        setValuationStatus("error");
        setValuationError(
          err instanceof Error ? err.message : "Unable to load Engine valuations.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    leagueId,
    token,
    watchlist.length,
    watchlistRequestKey,
    leagueValuationKey,
    rosterValuationKey,
  ]);

  const effectiveWatchlist = useMemo(() => {
    return watchlist.map((player) =>
      mergeWatchlistPlayerWithValuation(
        player,
        valuationsByPlayerId.get(player.id),
      ),
    );
  }, [watchlist, valuationsByPlayerId]);

  const filteredWatchlist = useMemo(() => {
    let result = [...effectiveWatchlist];

    if (viewFilter === "pitchers") {
      result = result.filter(isPitcher);
    } else if (viewFilter === "hitters") {
      result = result.filter((player) => !isPitcher(player));
    }

    result.sort((a, b) => {
      return (
        resolveValuationNumber(b, valuationSortField) -
        resolveValuationNumber(a, valuationSortField)
      );
    });

    return result;
  }, [effectiveWatchlist, viewFilter, valuationSortField]);

  const totalPlannedBudget = useMemo(
    () => allocationRows.reduce((sum, row) => sum + row.target, 0),
    [allocationRows],
  );

  const plannedRemaining = totalBudget - totalPlannedBudget;

  const watchlistTargetTotal = useMemo(() => {
    return effectiveWatchlist.reduce((sum, player) => {
      const bucket = getPositionBucket(player);
      const defaultTarget = Math.max(
        1,
        Math.round(
          resolveValuationNumber(player, "team_value") ||
            resolveValuationNumber(player, "recommended_bid") ||
            player.value ||
            positionTargets[bucket] ||
            1,
        ),
      );

      return sum + (targetOverrides[player.id] ?? defaultTarget);
    }, 0);
  }, [effectiveWatchlist, positionTargets, targetOverrides]);

  const positionAlerts = useMemo(() => {
    return allocationRows
      .map((row) => ({
        pos: row.pos,
        target: row.target,
      }))
      .filter((row) => row.target > totalBudget * 0.22 || row.target < 5);
  }, [allocationRows, totalBudget]);

  const watchlistRows = useMemo<WatchlistRow[]>(() => {
    return filteredWatchlist.map((player) => {
      const bucket = getPositionBucket(player);
      const defaultTarget = Math.max(
        1,
        Math.round(
          resolveValuationNumber(player, "team_value") ||
            resolveValuationNumber(player, "recommended_bid") ||
            player.value ||
            positionTargets[bucket] ||
            1,
        ),
      );

      const target = targetOverrides[player.id] ?? defaultTarget;
      const priority = priorityOverrides[player.id] ?? derivePriority(player);
      const supportingField = supportingFieldFor(valuationSortField);
      const draftState = resolvePlayerDraftState({
        player: watchlistToPlayer(player),
        draftedIds: draftMaps.draftedIds,
        draftedByTeam: draftMaps.draftedByTeam,
        draftedPriceByPlayerId: draftMaps.draftedPriceByPlayerId,
        draftedContractByPlayerId: draftMaps.draftedContractByPlayerId,
      });

      return {
        ...player,
        bucket,
        target,
        priority,
        primaryValue: resolveValuationNumber(player, valuationSortField),
        supportingValue: resolveValuationNumber(player, supportingField),
        draftedLabel: draftState.displayLabel,
        isDrafted: draftState.isDrafted,
      };
    });
  }, [
    filteredWatchlist,
    positionTargets,
    priorityOverrides,
    targetOverrides,
    valuationSortField,
    draftMaps,
  ]);

  function handleOpenPlayer(player: WatchlistPlayer) {
    setSelectedPlayer(watchlistToPlayer(player));
    navigation.navigate("CommandCenter", { leagueId });
  }

  function handleChangePositionTarget(pos: string, raw: string) {
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const next = { ...positionTargets, [pos]: parsed };
    void setPositionTargets(next);
  }

  function handleResetPositionTargets() {
    const next = Object.fromEntries(
      POSITION_PLAN.map((row) => [row.pos, row.target]),
    ) as Record<string, number>;

    void setPositionTargets(next);
  }

  function handleChangePlayerTarget(playerId: string, raw: string) {
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const next = { ...targetOverrides, [playerId]: parsed };
    void setTargetOverrides(next);
  }

  function handleStepPlayerTarget(
    playerId: string,
    delta: 1 | -1,
    current: number,
  ) {
    const nextValue = Math.max(1, current + delta);
    const next = { ...targetOverrides, [playerId]: nextValue };
    void setTargetOverrides(next);
  }

  function handleChangePriority(playerId: string, priority: Priority) {
    const next = { ...priorityOverrides, [playerId]: priority };
    void setPriorityOverrides(next);
  }

  function handleStartMockDraft() {
    if (allPlayers.length === 0) {
      Alert.alert(
        "Players still loading",
        "Wait for player data to finish loading before starting the mock draft.",
      );
      return;
    }

    startDraft();
    setMockSearchQuery("");
    setBidRaw("2");
    setCheckpointError("");
    setScreenMode("mock");
  }

  async function handleStartMockDraftFromCheckpoint() {
    if (!token) {
      Alert.alert("Sign in required", "You need to be signed in to load a checkpoint.");
      return;
    }

    if (!selectedCheckpointKey) {
      handleStartMockDraft();
      return;
    }

    if (allPlayers.length === 0) {
      Alert.alert(
        "Players still loading",
        "Wait for player data to finish loading before starting from a checkpoint.",
      );
      return;
    }

    setCheckpointBusy(true);
    setCheckpointError("");

    try {
      const json = await fetchEngineCheckpointJson(token, selectedCheckpointKey);
      const plan = planMockDraftFromCheckpointJson({
        checkpointKey: selectedCheckpointKey,
        checkpointJson: json,
        leagueTeamNames: teamNames,
        allPlayers,
      });

      if ("error" in plan) {
        setCheckpointError(plan.error);
        Alert.alert("Checkpoint error", plan.error);
        return;
      }

      await hydrateFromCheckpoint(plan.mockDraftState);
      setMockSearchQuery("");
      setBidRaw("2");
      setScreenMode("mock");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start from checkpoint.";
      setCheckpointError(message);
      Alert.alert("Checkpoint error", message);
    } finally {
      setCheckpointBusy(false);
    }
  }

  function handleResetMockDraft() {
    Alert.alert("Reset Mock Draft?", "This clears the saved mobile mock draft.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          void resetDraft();
          setMockSearchQuery("");
          setBidRaw("2");
        },
      },
    ]);
  }

  function handleBid() {
    const amount = Number.parseInt(bidRaw, 10);

    if (!Number.isFinite(amount) || amount < 1) {
      Alert.alert("Invalid bid", "Enter a valid bid amount.");
      return;
    }

    placeBid(amount);
    setBidRaw(String(amount + 1));
  }

  if (!league) {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  if (screenMode === "mock") {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.purple2}
              colors={[colors.purple2]}
              onRefresh={() => void loadData("refresh")}
            />
          }
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 24,
                  fontWeight: "900",
                }}
              >
                AI Mock Draft
              </Text>

              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Practice the auction from inside My Draft.
              </Text>
            </View>

            <AppButton
              title="Back"
              variant="ghost"
              onPress={() => setScreenMode("plan")}
            />
          </View>

          {valuationError ? <ErrorState label={valuationError} /> : null}

          {!storageLoaded || loadingPlayers ? (
            <LoadingState label="Loading mock draft..." />
          ) : state.phase === "setup" ? (
            <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
              <SectionHeader
                title="AI Mock Draft"
                meta="Simulate your auction draft against AI-controlled teams. Snake nomination order · Strategic AI bidding."
              />

              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <MetricPill label="Your team" value={teamNames[0] ?? "Team 1"} />
                <MetricPill
                  label="AI teams"
                  value={String(Math.max(0, teamNames.length - 1))}
                />
                <MetricPill label="Budget per team" value={formatMoney(league.budget)} />
                <MetricPill label="Order" value="Snake" highlight />
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface2,
                  borderRadius: 14,
                  padding: 12,
                  marginTop: 8,
                  marginBottom: 14,
                }}
              >
                <Text
                  style={{
                    color: colors.purple2,
                    fontSize: 11,
                    fontWeight: "900",
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Engine Checkpoint (Optional)
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <AppChip
                    label="— Fresh draft —"
                    selected={selectedCheckpointKey === ""}
                    onPress={() => {
                      setSelectedCheckpointKey("");
                      setCheckpointError("");
                    }}
                    style={{ marginRight: 8 }}
                  />

                  {checkpointCatalog.map((checkpoint) => (
                    <AppChip
                      key={checkpoint.id}
                      label={checkpointDisplayLabel(checkpoint, checkpoint.id)}
                      selected={selectedCheckpointKey === checkpoint.id}
                      onPress={() => {
                        setSelectedCheckpointKey(checkpoint.id);
                        setCheckpointError("");
                      }}
                      style={{ marginRight: 8 }}
                    />
                  ))}
                </ScrollView>

                <Text style={{ color: colors.muted, marginTop: 10, lineHeight: 19 }}>
                  {selectedCheckpointKey
                    ? "Loads the selected bundled Draft fixture, including already drafted players, rosters, budgets, and the next auction state."
                    : "Fresh draft starts from your current league settings and the current player pool."}
                </Text>

                {checkpointCatalogPhase === "loading" ? (
                  <Text style={{ color: colors.muted, marginTop: 8 }}>
                    Loading Engine checkpoints...
                  </Text>
                ) : null}

                {checkpointCatalogPhase === "error" ? (
                  <Text style={{ color: "#fecaca", marginTop: 8 }}>
                    {checkpointCatalogError || "Unable to load checkpoints."}
                  </Text>
                ) : null}

                {checkpointError ? (
                  <Text style={{ color: "#fecaca", marginTop: 8 }}>
                    {checkpointError}
                  </Text>
                ) : null}
              </View>

              <Text style={{ color: colors.muted, marginBottom: 10 }}>
                Your team:{" "}
                <Text style={{ color: colors.green, fontWeight: "900" }}>
                  {teamNames[0] ?? "Team 1"}
                </Text>
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 14 }}
              >
                {teamNames.map((teamName, index) => (
                  <View
                    key={`${teamName}-${index}`}
                    style={{
                      borderWidth: 1,
                      borderColor: index === 0 ? colors.purple2 : colors.border,
                      backgroundColor: index === 0 ? "#2a1845" : colors.surface2,
                      borderRadius: 12,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: index === 0 ? "#f5eaff" : colors.text,
                        fontWeight: "900",
                      }}
                    >
                      {teamName}
                    </Text>
                    <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }}>
                      {index === 0 ? "You" : "AI"}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {hasSavedDraft ? (
                <Text style={{ color: colors.gold, marginBottom: 12 }}>
                  Saved draft found. Starting again will replace the saved mobile mock draft.
                </Text>
              ) : null}

              <AppButton
                title={selectedCheckpointKey ? "Start from checkpoint" : "Start Mock Draft"}
                fullWidth
                loading={checkpointBusy}
                disabled={checkpointBusy || loadingPlayers || allPlayers.length === 0}
                onPress={
                  selectedCheckpointKey
                    ? handleStartMockDraftFromCheckpoint
                    : handleStartMockDraft
                }
              />

              <AppButton
                title="Reset Saved Draft"
                variant="danger"
                fullWidth
                style={{ marginTop: 10 }}
                onPress={handleResetMockDraft}
              />
            </AppCard>
          ) : state.phase === "complete" ? (
            <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: "900",
                  marginBottom: 10,
                }}
              >
                Mock Draft Complete
              </Text>

              {state.rosters.map((roster) => (
                <View
                  key={roster.teamName}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "900" }}>
                    {roster.teamName}
                    {roster.isUser ? " (You)" : ""}
                  </Text>
                  <Text style={{ color: colors.muted, marginTop: 2 }}>
                    {roster.picks.length} picks · {formatMoney(roster.spent)} spent ·{" "}
                    {formatMoney(roster.budget - roster.spent)} left
                  </Text>
                </View>
              ))}

              <View style={{ marginTop: 12 }}>
                <AppButton title="Run Again" onPress={handleStartMockDraft} />
                <AppButton
                  title="Back to My Draft"
                  variant="secondary"
                  style={{ marginTop: 10 }}
                  onPress={() => setScreenMode("plan")}
                />
              </View>
            </AppCard>
          ) : (
            <>
              <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 18,
                        fontWeight: "900",
                      }}
                    >
                      Drafting
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 4 }}>
                      Current team:{" "}
                      <Text style={{ color: colors.text, fontWeight: "900" }}>
                        {currentTeam?.teamName ?? "—"}
                      </Text>
                    </Text>

                    <Text
                      style={{
                        color: state.phase === "sold" ? colors.green : colors.gold,
                        marginTop: 6,
                        fontWeight: "900",
                        fontSize: state.phase === "sold" ? 16 : 14,
                      }}
                    >
                      {state.message || "Mock draft running."}
                    </Text>
                  </View>

                  <AppButton
                    title="Reset"
                    variant="danger"
                    onPress={handleResetMockDraft}
                  />
                </View>
              </AppCard>

              <AppCard backgroundColor="#120e1f" borderColor="#3d2864">
                <SectionHeader
                  title="Team Rosters"
                  meta="Budgets and picks update as players are sold."
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {state.rosters.map((roster) => (
                    <View
                      key={roster.teamName}
                      style={{
                        width: 220,
                        borderWidth: 1,
                        borderColor: roster.isUser ? colors.purple2 : colors.border,
                        backgroundColor: roster.isUser ? "#2a1845" : colors.surface2,
                        borderRadius: 14,
                        padding: 12,
                        marginRight: 10,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900" }}>
                        {roster.teamName}
                        {roster.isUser ? " (You)" : ""}
                      </Text>

                      <Text style={{ color: colors.muted, marginTop: 4 }}>
                        {formatMoney(roster.budget - roster.spent)} left ·{" "}
                        {formatMoney(roster.spent)} spent
                      </Text>

                      {(roster.picks ?? []).slice(0, 8).map((pick, index) => (
                        <Text
                          key={`${pick.player.id}-${index}`}
                          numberOfLines={1}
                          style={{ color: colors.text, marginTop: 7, fontSize: 12 }}
                        >
                          {pick.slot}: {pick.player.name} · {formatMoney(pick.price)}
                        </Text>
                      ))}

                      {roster.picks.length === 0 ? (
                        <Text style={{ color: colors.muted, marginTop: 8 }}>
                          No picks yet.
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              </AppCard>

              {state.phase === "nomination" && isUserTurn ? (
                <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                  <SectionHeader
                    title="Your Nomination"
                    meta="Choose a player to put on the block."
                  />

                  {state.suggestion ? (
                    <TouchableOpacity
                      activeOpacity={0.86}
                      onPress={() => nominatePlayer(state.suggestion!.player)}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.purple2,
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 12,
                        backgroundColor: "#2a1845",
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900" }}>
                        Suggested: {state.suggestion.player.name}
                      </Text>
                      <Text style={{ color: colors.muted, marginTop: 4 }}>
                        {state.suggestion.reason}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TextInput
                    placeholder="Search player to nominate..."
                    placeholderTextColor={colors.muted}
                    value={mockSearchQuery}
                    onChangeText={setMockSearchQuery}
                    autoCapitalize="none"
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.text,
                      backgroundColor: colors.surface2,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  />

                  {mockSearchResults.length === 0 ? (
                    <Text style={{ color: colors.muted }}>
                      Type at least 2 letters to search available players.
                    </Text>
                  ) : (
                    mockSearchResults.map((player) => (
                      <TouchableOpacity
                        key={player.id}
                        activeOpacity={0.82}
                        onPress={() => {
                          nominatePlayer(player);
                          setMockSearchQuery("");
                          setBidRaw("2");
                        }}
                        style={{
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "900" }}>
                          {player.name}
                        </Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          {player.team} · {player.position} · Value{" "}
                          {formatMoney(player.value ?? 0)}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </AppCard>
              ) : null}

              {state.nominatedPlayer ? (
                <AppCard backgroundColor="#151021" borderColor="#5b3a89">
                  <SectionHeader
                    title="On the Block"
                    meta={
                      state.phase === "sold"
                        ? "Sale is being finalized."
                        : "Auction bidding is active."
                    }
                  />

                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 24,
                      fontWeight: "900",
                    }}
                  >
                    {state.nominatedPlayer.name}
                  </Text>

                  <Text style={{ color: colors.muted, marginTop: 4 }}>
                    {state.nominatedPlayer.team} · {state.nominatedPlayer.position} · Value{" "}
                    {formatMoney(state.nominatedPlayer.value ?? 0)}
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
                    <MetricPill
                      label="Current Bid"
                      value={formatMoney(state.currentBid)}
                      highlight
                    />
                    <MetricPill
                      label="Leader"
                      value={state.currentBidder || "—"}
                    />
                    <MetricPill
                      label="Your Budget"
                      value={formatMoney(userRemaining)}
                    />
                  </View>

                  {state.phase === "sold" ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: "rgba(34,197,94,0.45)",
                        backgroundColor: "rgba(34,197,94,0.12)",
                        borderRadius: 14,
                        padding: 14,
                        marginTop: 4,
                        marginBottom: 14,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.green,
                          fontSize: 20,
                          fontWeight: "900",
                          letterSpacing: 0.7,
                        }}
                      >
                        SOLD!
                      </Text>

                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 16,
                          fontWeight: "900",
                          marginTop: 4,
                        }}
                      >
                        {state.currentBidder} wins {state.nominatedPlayer.name} for{" "}
                        {formatMoney(state.currentBid)}.
                      </Text>
                    </View>
                  ) : null}

                  {state.phase === "bidding" ? (
                    <>
                      <Text style={{ color: colors.muted, marginBottom: 6 }}>
                        Your bid
                      </Text>

                      <TextInput
                        value={bidRaw}
                        onChangeText={setBidRaw}
                        keyboardType="number-pad"
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          color: colors.text,
                          backgroundColor: colors.surface2,
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      />

                      <AppButton title="Place Bid" fullWidth onPress={handleBid} />
                    </>
                  ) : null}

                  {state.phase === "user-confirm" ? (
                    <View style={{ marginTop: 4 }}>
                      <AppButton
                        title="Keep Bidding"
                        fullWidth
                        onPress={keepBidding}
                      />

                      <AppButton
                        title="Done — Let Them Have It"
                        variant="secondary"
                        fullWidth
                        style={{ marginTop: 10 }}
                        onPress={confirmSell}
                      />
                    </View>
                  ) : null}
                </AppCard>
              ) : null}

              <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                <SectionHeader
                  title="Your Budget"
                  meta={`${userRoster?.picks.length ?? 0} picks · ${formatMoney(userRoster?.spent ?? 0)} spent`}
                />

                <Text
                  style={{
                    color: colors.gold,
                    fontSize: 28,
                    fontWeight: "900",
                    marginBottom: 10,
                  }}
                >
                  {formatMoney(userRemaining)}
                </Text>

                {(userRoster?.picks ?? []).length === 0 ? (
                  <Text style={{ color: colors.muted }}>No picks yet.</Text>
                ) : (
                  userRoster!.picks.map((pick, index) => (
                    <Text
                      key={`${pick.player.id}-${index}`}
                      style={{ color: colors.text, marginBottom: 6 }}
                    >
                      {pick.slot}: {pick.player.name} — {formatMoney(pick.price)}
                    </Text>
                  ))
                )}
              </AppCard>

              <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                <SectionHeader
                  title="Your Watchlist"
                  meta="Use this while deciding who to nominate or chase."
                />

                {watchlistPlayers.length === 0 ? (
                  <EmptyState label="Star players in Research to populate your watchlist." />
                ) : (
                  watchlistPlayers.slice(0, 12).map((player) => (
                    <TouchableOpacity
                      key={player.id}
                      activeOpacity={0.82}
                      onPress={() => {
                        if (state.phase === "nomination" && isUserTurn) {
                          nominatePlayer(player);
                        }
                      }}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        paddingVertical: 9,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900" }}>
                        {player.name}
                      </Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>
                        {player.team} · {player.position} · Value{" "}
                        {formatMoney(player.value ?? 0)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </AppCard>

              <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                <SectionHeader title="Draft Log" meta={`${state.log.length} picks`} />

                {state.log.length === 0 ? (
                  <Text style={{ color: colors.muted }}>No picks yet.</Text>
                ) : (
                  [...state.log]
                    .reverse()
                    .slice(0, 30)
                    .map((entry) => (
                      <View
                        key={entry.pickNum}
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                          paddingVertical: 9,
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "900" }}>
                          #{entry.pickNum} {entry.player.name}
                        </Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          {entry.teamName} · {entry.slot} · {formatMoney(entry.price)}
                        </Text>
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

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadData("refresh")}
          />
        }
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "900",
            marginBottom: 4,
          }}
        >
          My Draft
        </Text>

        <Text style={{ color: colors.muted, marginBottom: 16 }}>
          Plan your budget, manage starred targets, keep draft notes, and run an AI mock draft.
        </Text>

        {valuationError ? <ErrorState label={valuationError} /> : null}

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <SectionHeader
            title="Planning Summary"
            meta="Position plan, buffer, and watchlist targets."
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <MetricPill label="Total Budget" value={formatMoney(totalBudget)} highlight />
            <MetricPill label="Position plan" value={formatMoney(totalPlannedBudget)} />
            <MetricPill
              label="Plan buffer"
              value={formatSignedMoney(plannedRemaining)}
              highlight={plannedRemaining >= 0}
            />
            <MetricPill
              label="Watchlist targets"
              value={formatMoney(watchlistTargetTotal)}
            />
          </View>

          {valuationStatus === "loading" ? (
            <Text style={{ color: colors.muted, marginTop: 4 }}>
              Loading Engine valuations...
            </Text>
          ) : null}

          {valuationStatus === "error" ? (
            <Text style={{ color: "#fecaca", marginTop: 4 }}>
              {valuationError || "Unable to load Engine valuations."}
            </Text>
          ) : null}
        </AppCard>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <SectionHeader
            title="Position Allocation"
            meta="Assign your auction budget by roster slot."
          />

          <AllocationBar
            rows={allocationRows}
            totalBudget={totalBudget}
            plannedRemaining={plannedRemaining}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
            <MetricPill
              label="Watchlist Targets"
              value={formatMoney(watchlistTargetTotal)}
            />
            <MetricPill
              label="Budget Check"
              value={
                plannedRemaining < 0
                  ? `${formatMoney(Math.abs(plannedRemaining))} over`
                  : `${formatMoney(plannedRemaining)} free`
              }
              highlight={plannedRemaining >= 0}
            />
          </View>

          <AppButton
            title="AI Mock Draft"
            fullWidth
            style={{ marginTop: 8 }}
            onPress={() => {
              if (state.phase === "setup") {
                setScreenMode("mock");
              } else {
                setScreenMode("mock");
              }
            }}
          />

          {hasSavedDraft || state.phase !== "setup" ? (
            <AppButton
              title="Reset Saved Mock Draft"
              variant="danger"
              fullWidth
              style={{ marginTop: 10 }}
              onPress={handleResetMockDraft}
            />
          ) : null}
        </AppCard>

        <AppCard backgroundColor="#100c18" borderColor="#31224f">
          <SectionHeader
            title="Planner Checks"
            meta="Warnings based on your current budget plan."
          />

          {plannedRemaining < 0 ? (
            <Text style={{ color: "#fecaca", marginBottom: 7 }}>
              You are over budget by {formatMoney(Math.abs(plannedRemaining))}.
            </Text>
          ) : (
            <Text style={{ color: "#bbf7d0", marginBottom: 7 }}>
              You still have {formatMoney(plannedRemaining)} unassigned.
            </Text>
          )}

          {watchlistTargetTotal > totalBudget ? (
            <Text style={{ color: "#fecaca", marginBottom: 7 }}>
              Watchlist targets exceed total budget by{" "}
              {formatMoney(watchlistTargetTotal - totalBudget)}.
            </Text>
          ) : (
            <Text style={{ color: "#bbf7d0", marginBottom: 7 }}>
              Watchlist targets fit within the total budget.
            </Text>
          )}

          {positionAlerts.length > 0 ? (
            positionAlerts.map((row) => (
              <Text key={row.pos} style={{ color: colors.muted, marginBottom: 4 }}>
                • {row.pos}: target {formatMoney(row.target)}
              </Text>
            ))
          ) : (
            <Text style={{ color: colors.muted }}>No planner warnings right now.</Text>
          )}
        </AppCard>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 10,
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <SectionHeader
                title="Position Allocation"
                meta="Edit target dollars; the allocation bar updates automatically."
              />
            </View>

            <AppButton
              title="Reset Defaults"
              variant="secondary"
              onPress={handleResetPositionTargets}
            />
          </View>

          {allocationRows.map((row, index) => (
            <View
              key={row.pos}
              style={{
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <PositionBadge label={row.pos} style={{ marginBottom: 0 }} />

                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "900" }}>
                    {row.pos} · {row.slots} slot{row.slots === 1 ? "" : "s"}
                  </Text>
                  <Text style={{ color: colors.muted, marginTop: 2 }}>
                    Per slot: {formatMoney(row.target / Math.max(1, row.slots))}
                  </Text>
                </View>

                <Text style={{ color: colors.gold, fontWeight: "900" }}>
                  {formatMoney(row.target)}
                </Text>
              </View>

              <TextInput
                defaultValue={String(row.target)}
                keyboardType="numeric"
                onEndEditing={(event) =>
                  handleChangePositionTarget(row.pos, event.nativeEvent.text)
                }
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 11,
                  backgroundColor: colors.surface2,
                  color: colors.text,
                }}
              />
            </View>
          ))}
        </AppCard>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <SectionHeader
            title="Strategic Watchlist"
            meta={`${watchlistRows.length} shown · ${watchlist.length} total`}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            <AppChip
              label="All"
              selected={viewFilter === "all"}
              onPress={() => setViewFilter("all")}
              style={{ marginRight: 8 }}
            />
            <AppChip
              label="Hitters"
              selected={viewFilter === "hitters"}
              onPress={() => setViewFilter("hitters")}
              style={{ marginRight: 8 }}
            />
            <AppChip
              label="Pitchers"
              selected={viewFilter === "pitchers"}
              onPress={() => setViewFilter("pitchers")}
            />
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {(
              [
                "auction_value",
                "team_value",
                "recommended_bid",
                "baseline_value",
              ] as ValuationSortField[]
            ).map((field) => (
              <AppChip
                key={field}
                label={valuationLabel(field)}
                selected={valuationSortField === field}
                onPress={() => setValuationSortField(field)}
                style={{ marginRight: 8 }}
              />
            ))}
          </ScrollView>

          {watchlistRows.length === 0 ? (
            <EmptyState label="Star players in Research to populate this watchlist." />
          ) : (
            watchlistRows.map((row, index) => {
              const supportingField = supportingFieldFor(valuationSortField);

              return (
                <View
                  key={row.id}
                  style={{
                    paddingVertical: 13,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <TouchableOpacity activeOpacity={0.84} onPress={() => handleOpenPlayer(row)}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
                          {row.name}
                        </Text>

                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          {row.team} · {row.position} · ADP {row.adp ?? "—"}
                        </Text>

                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          Bucket {row.bucket} · {valuationLabel(valuationSortField)}{" "}
                          {formatMoney(row.primaryValue)}
                        </Text>

                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          {valuationLabel(supportingField)}{" "}
                          {formatMoney(row.supportingValue)}
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={{
                            color: row.isDrafted ? "#fca5a5" : colors.green,
                            fontWeight: "900",
                            fontSize: 12,
                          }}
                        >
                          {row.isDrafted ? "Drafted" : "Available"}
                        </Text>

                        <Text
                          numberOfLines={2}
                          style={{
                            color: colors.muted,
                            marginTop: 3,
                            fontSize: 11,
                            maxWidth: 90,
                            textAlign: "right",
                          }}
                        >
                          {row.draftedLabel}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <Text style={{ color: colors.text, marginTop: 10, fontWeight: "900" }}>
                    Target Price
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 8,
                      marginBottom: 10,
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => handleStepPlayerTarget(row.id, -1, row.target)}
                      style={{
                        paddingHorizontal: 13,
                        paddingVertical: 10,
                        borderRadius: 9,
                        backgroundColor: colors.surface2,
                        borderWidth: 1,
                        borderColor: colors.border,
                        marginRight: 8,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900" }}>−</Text>
                    </TouchableOpacity>

                    <TextInput
                      defaultValue={String(row.target)}
                      keyboardType="numeric"
                      onEndEditing={(event) =>
                        handleChangePlayerTarget(row.id, event.nativeEvent.text)
                      }
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        padding: 11,
                        backgroundColor: colors.surface2,
                        color: colors.text,
                      }}
                    />

                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => handleStepPlayerTarget(row.id, 1, row.target)}
                      style={{
                        paddingHorizontal: 13,
                        paddingVertical: 10,
                        borderRadius: 9,
                        backgroundColor: colors.surface2,
                        borderWidth: 1,
                        borderColor: colors.border,
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900" }}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color: colors.text, marginBottom: 8, fontWeight: "900" }}>
                    Priority
                  </Text>

                  <View style={{ flexDirection: "row", marginBottom: 10 }}>
                    {(["High", "Medium", "Low"] as Priority[]).map((label) => (
                      <AppChip
                        key={label}
                        label={label}
                        selected={row.priority === label}
                        onPress={() => handleChangePriority(row.id, label)}
                        style={{ marginRight: 8 }}
                      />
                    ))}
                  </View>

                  <Text style={{ color: colors.text, marginBottom: 8, fontWeight: "900" }}>
                    Player Note
                  </Text>

                  <TextInput
                    value={getNote(leagueId, row.id)}
                    onChangeText={(text) => setNote(leagueId, row.id, text)}
                    placeholder="Note for this player..."
                    placeholderTextColor={colors.muted}
                    multiline
                    style={{
                      minHeight: 72,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 10,
                      backgroundColor: colors.surface2,
                      color: colors.text,
                      textAlignVertical: "top",
                      marginBottom: 10,
                    }}
                  />

                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <AppChip
                      label="Open in Command"
                      selected
                      onPress={() => handleOpenPlayer(row)}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />

                    <AppChip
                      label="Remove"
                      tone="danger"
                      onPress={() => void removeFromWatchlist(leagueId, row.id)}
                      style={{ marginBottom: 8 }}
                    />
                  </View>
                </View>
              );
            })
          )}
        </AppCard>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <SectionHeader
            title="Draft Notes"
            meta="Use this as your league-level scratchpad during the draft."
          />

          <TextInput
            value={getNote(leagueId, "__draft__")}
            onChangeText={(text) => setNote(leagueId, "__draft__", text)}
            placeholder="Draft strategy, budget rules, targets, fades..."
            placeholderTextColor={colors.muted}
            multiline
            style={{
              minHeight: 150,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.surface2,
              color: colors.text,
              textAlignVertical: "top",
            }}
          />
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}