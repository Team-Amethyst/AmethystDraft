import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { getValuation, type ValuationResult } from "../api/engine";
import { getRoster, type RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useDraftPlan, type Priority } from "../hooks/useDraftPlan";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";

type Props = BottomTabScreenProps<LeagueTabParamList, "MyDraft">;
type ViewFilter = "all" | "hitters" | "pitchers";
type ValuationSortField =
  | "auction_value"
  | "team_adjusted_value"
  | "recommended_bid"
  | "adjusted_value"
  | "baseline_value";

type WatchlistRow = WatchlistPlayer & {
  bucket: string;
  target: number;
  priority: Priority;
  primaryValue: number;
  supportingValue: number;
};

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
    value: p.team_adjusted_value ?? p.recommended_bid ?? p.adjusted_value ?? p.value,
    tier: p.catalog_tier ?? p.tier,
    headshot: "",
    outlook: "",
    stats: {},
    projection: {},
  };
}

function isPitcher(player: WatchlistPlayer): boolean {
  const direct = player.position.toUpperCase();
  const multi = (player.positions ?? []).map((p) => p.toUpperCase());

  if (
    direct.includes("SP") ||
    direct.includes("RP") ||
    direct === "P" ||
    multi.includes("SP") ||
    multi.includes("RP") ||
    multi.includes("P")
  ) {
    return true;
  }

  return false;
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

function getNumericValue(
  source: unknown,
  key: string,
): number | undefined {
  const data = source as Record<string, unknown> | undefined;
  const raw = data?.[key];

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
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
    adjusted_value:
      getNumericValue(valuation, "adjusted_value") ?? player.adjusted_value,
    recommended_bid:
      getNumericValue(valuation, "recommended_bid") ?? player.recommended_bid,
    team_adjusted_value:
      getNumericValue(valuation, "team_adjusted_value") ??
      player.team_adjusted_value,
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
    "team_adjusted_value",
    "recommended_bid",
    "adjusted_value",
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
  if (field === "team_adjusted_value") return "Team Value";
  if (field === "recommended_bid") return "Rec Bid";
  if (field === "adjusted_value") return "Adjusted";
  if (field === "baseline_value") return "Baseline";
  return "Auction";
}

function derivePriority(player: WatchlistPlayer): Priority {
  const decisionValue = resolveValuationNumber(player, "team_adjusted_value");
  const tier = player.catalog_tier ?? player.tier;

  if (decisionValue >= 45 || tier <= 2) return "High";
  if (decisionValue >= 28 || tier === 3) return "Medium";
  return "Low";
}

function supportingFieldFor(field: ValuationSortField): ValuationSortField {
  if (field === "team_adjusted_value") return "recommended_bid";
  if (field === "recommended_bid") return "team_adjusted_value";
  return "recommended_bid";
}

export default function MyDraftScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();
  const { setSelectedPlayer } = useSelectedPlayer();
  const { getWatchlistForLeague, loadWatchlist, removeFromWatchlist } =
    useWatchlist();
  const { getNote, setNote, loadNotes } = usePlayerNotes();

  const league = useMemo(
    () => allLeagues.find((item) => item.id === leagueId),
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

  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [valuationSortField, setValuationSortField] =
    useState<ValuationSortField>("team_adjusted_value");
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationResult>
  >(new Map());
  const [valuationStatus, setValuationStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [valuationError, setValuationError] = useState("");

  useEffect(() => {
    void loadWatchlist(leagueId);
    void loadNotes(leagueId);
  }, [leagueId, loadWatchlist, loadNotes]);

  useEffect(() => {
    if (!token) {
      setRosterEntries([]);
      return;
    }

    void getRoster(leagueId, token)
      .then(setRosterEntries)
      .catch(() => setRosterEntries([]));
  }, [leagueId, token]);

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

        const merged = new Map<string, ValuationResult>();

        for (const row of response.valuations) {
          merged.set(row.player_id, row);
        }

        setValuationsByPlayerId(merged);
        setValuationStatus("ready");
        setValuationError("");
      })
      .catch((err) => {
        if (cancelled) return;

        setValuationsByPlayerId(new Map());
        setValuationStatus("error");
        setValuationError(
          err instanceof Error ? err.message : "Unable to load valuations.",
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

  const positionAlerts = useMemo(() => {
    return allocationRows
      .map((row) => {
        const target = row.target;

        return {
          pos: row.pos,
          target,
        };
      })
      .filter((row) => row.target > totalBudget * 0.22 || row.target < 5);
  }, [allocationRows, totalBudget]);

  const watchlistRows = useMemo<WatchlistRow[]>(() => {
    return filteredWatchlist.map((player) => {
      const bucket = getPositionBucket(player);
      const defaultTarget = Math.max(
        1,
        Math.round(
          resolveValuationNumber(player, "team_adjusted_value") ||
            resolveValuationNumber(player, "recommended_bid") ||
            player.value ||
            positionTargets[bucket] ||
            1,
        ),
      );

      const target = targetOverrides[player.id] ?? defaultTarget;
      const priority = priorityOverrides[player.id] ?? derivePriority(player);
      const supportingField = supportingFieldFor(valuationSortField);

      return {
        ...player,
        bucket,
        target,
        priority,
        primaryValue: resolveValuationNumber(player, valuationSortField),
        supportingValue: resolveValuationNumber(player, supportingField),
      };
    });
  }, [
    filteredWatchlist,
    positionTargets,
    priorityOverrides,
    targetOverrides,
    valuationSortField,
  ]);

  const watchlistTargetTotal = useMemo(() => {
    return effectiveWatchlist.reduce((sum, player) => {
      const bucket = getPositionBucket(player);
      const defaultTarget = Math.max(
        1,
        Math.round(
          resolveValuationNumber(player, "team_adjusted_value") ||
            resolveValuationNumber(player, "recommended_bid") ||
            player.value ||
            positionTargets[bucket] ||
            1,
        ),
      );

      return sum + (targetOverrides[player.id] ?? defaultTarget);
    }, 0);
  }, [effectiveWatchlist, positionTargets, targetOverrides]);

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

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
          My Draft
        </Text>

        <AppCard>
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>League Summary</Text>
          <Text style={{ marginBottom: 6 }}>League: {league?.name ?? "Unknown"}</Text>
          <Text style={{ marginBottom: 6 }}>Budget: ${totalBudget}</Text>
          <Text style={{ marginBottom: 6 }}>Watchlist: {watchlist.length}</Text>
          <Text style={{ marginBottom: 6 }}>
            Watchlist targets: ${watchlistTargetTotal}
          </Text>
          <Text>Scoring: 5x5 Roto</Text>

          {valuationStatus === "loading" ? (
            <Text style={{ color: "#6b7280", marginTop: 8 }}>
              Loading Engine valuations...
            </Text>
          ) : null}

          {valuationStatus === "error" ? (
            <Text style={{ color: "#b91c1c", marginTop: 8 }}>
              {valuationError || "Unable to load Engine valuations."}
            </Text>
          ) : null}
        </AppCard>

        <AppCard>
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>Allocation Bar</Text>

          <View
            style={{
              height: 18,
              borderRadius: 999,
              overflow: "hidden",
              flexDirection: "row",
              backgroundColor: "#f3f4f6",
              marginBottom: 12,
            }}
          >
            {allocationRows.map((row) => (
              <View
                key={row.pos}
                style={{
                  width: `${Math.max(0, (row.target / totalBudget) * 100)}%`,
                  backgroundColor: row.color,
                }}
              />
            ))}

            {plannedRemaining > 0 ? (
              <View
                style={{
                  width: `${Math.max(0, (plannedRemaining / totalBudget) * 100)}%`,
                  backgroundColor: "#e5e7eb",
                }}
              />
            ) : null}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {allocationRows.map((row) => (
              <Text
                key={row.pos}
                style={{
                  marginRight: 10,
                  marginBottom: 6,
                  color: "#4b5563",
                }}
              >
                {row.pos} ${row.target}
              </Text>
            ))}
          </View>

          <Text>Total planned: ${totalPlannedBudget}</Text>
          <Text
            style={{
              color: plannedRemaining < 0 ? "#b91c1c" : "#166534",
              marginTop: 4,
            }}
          >
            Remaining: ${plannedRemaining}
          </Text>
        </AppCard>

        <AppCard backgroundColor="#fafafa">
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>Planner Checks</Text>

          {plannedRemaining < 0 ? (
            <Text style={{ color: "#b91c1c", marginBottom: 6 }}>
              You are over budget by ${Math.abs(plannedRemaining)}.
            </Text>
          ) : (
            <Text style={{ color: "#166534", marginBottom: 6 }}>
              You still have ${plannedRemaining} unassigned.
            </Text>
          )}

          {watchlistTargetTotal > totalBudget ? (
            <Text style={{ color: "#b91c1c", marginBottom: 6 }}>
              Watchlist targets exceed total budget by $
              {watchlistTargetTotal - totalBudget}.
            </Text>
          ) : (
            <Text style={{ color: "#166534", marginBottom: 6 }}>
              Watchlist targets fit within the total budget.
            </Text>
          )}

          {positionAlerts.length > 0 ? (
            positionAlerts.map((row) => (
              <Text key={row.pos} style={{ color: "#6b7280", marginBottom: 4 }}>
                • {row.pos}: target ${row.target}
              </Text>
            ))
          ) : (
            <Text style={{ color: "#6b7280" }}>No planner warnings right now.</Text>
          )}
        </AppCard>

        <AppCard>
          <Text style={{ fontWeight: "700", marginBottom: 10 }}>
            Position Targets
          </Text>

          {allocationRows.map((row, index) => (
            <View
              key={row.pos}
              style={{
                paddingVertical: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: "#f1f5f9",
              }}
            >
              <Text style={{ fontWeight: "600" }}>
                {row.pos} • {row.slots} slot{row.slots === 1 ? "" : "s"}
              </Text>

              <Text style={{ color: "#6b7280", marginTop: 2 }}>
                Per slot: ${(row.target / row.slots).toFixed(1)}
              </Text>

              <TextInput
                defaultValue={String(row.target)}
                keyboardType="numeric"
                onEndEditing={(event) =>
                  handleChangePositionTarget(row.pos, event.nativeEvent.text)
                }
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginTop: 8,
                }}
              />
            </View>
          ))}
        </AppCard>

        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
        </View>

        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(
              [
                "team_adjusted_value",
                "recommended_bid",
                "auction_value",
                "adjusted_value",
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
        </View>

        <AppCard>
          <Text style={{ fontWeight: "700", marginBottom: 4 }}>
            Strategic Watchlist
          </Text>

          <Text style={{ color: "#6b7280", marginBottom: 10 }}>
            {filteredWatchlist.length} shown • {watchlist.length} total
          </Text>

          {watchlistRows.length === 0 ? (
            <EmptyState label="Star players in Research to populate this watchlist." />
          ) : (
            watchlistRows.map((row, index) => {
              const supportingField = supportingFieldFor(valuationSortField);

              return (
                <View
                  key={row.id}
                  style={{
                    paddingVertical: 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: "#f1f5f9",
                  }}
                >
                  <TouchableOpacity onPress={() => handleOpenPlayer(row)}>
                    <Text style={{ fontWeight: "600" }}>{row.name}</Text>

                    <Text style={{ color: "#4b5563", marginTop: 2 }}>
                      {row.team} • {row.position} • ADP {row.adp}
                    </Text>

                    <Text style={{ color: "#4b5563", marginTop: 2 }}>
                      Bucket {row.bucket} • {valuationLabel(valuationSortField)} $
                      {Math.round(row.primaryValue)}
                    </Text>

                    <Text style={{ color: "#6b7280", marginTop: 2 }}>
                      {valuationLabel(supportingField)} $
                      {Math.round(row.supportingValue)}
                    </Text>
                  </TouchableOpacity>

                  <Text style={{ marginTop: 8, fontWeight: "600" }}>
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
                      onPress={() => handleStepPlayerTarget(row.id, -1, row.target)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: "#e5e7eb",
                        marginRight: 8,
                      }}
                    >
                      <Text style={{ fontWeight: "800" }}>−</Text>
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
                        borderColor: "#cbd5e1",
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: "white",
                      }}
                    />

                    <TouchableOpacity
                      onPress={() => handleStepPlayerTarget(row.id, 1, row.target)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: "#e5e7eb",
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ fontWeight: "800" }}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ marginBottom: 8, fontWeight: "600" }}>
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

                  <Text style={{ marginBottom: 8, fontWeight: "600" }}>
                    Player Note
                  </Text>

                  <TextInput
                    value={getNote(leagueId, row.id)}
                    onChangeText={(text) => setNote(leagueId, row.id, text)}
                    placeholder="Note for this player..."
                    multiline
                    style={{
                      minHeight: 70,
                      borderWidth: 1,
                      borderColor: "#cbd5e1",
                      borderRadius: 8,
                      padding: 10,
                      backgroundColor: "white",
                      textAlignVertical: "top",
                      marginBottom: 10,
                    }}
                  />

                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <AppChip
                      label="Open"
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

        <AppCard>
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>Draft Notes</Text>

          <TextInput
            value={getNote(leagueId, "__draft__")}
            onChangeText={(text) => setNote(leagueId, "__draft__", text)}
            placeholder="Draft strategy, budget rules, targets, fades..."
            multiline
            style={{
              minHeight: 140,
              borderWidth: 1,
              borderColor: "#cbd5e1",
              borderRadius: 8,
              padding: 12,
              backgroundColor: "white",
              textAlignVertical: "top",
            }}
          />
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}