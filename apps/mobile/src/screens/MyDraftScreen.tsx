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
import type { WatchlistPlayer } from "../api/watchlist";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState } from "../components/ui/ScreenState";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useDraftPlan, type Priority } from "../hooks/useDraftPlan";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";

type Props = BottomTabScreenProps<LeagueTabParamList, "MyDraft">;
type ViewFilter = "all" | "hitters" | "pitchers";

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
    value: p.value,
    tier: p.tier,
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

export default function MyDraftScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
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

  useEffect(() => {
    void loadWatchlist(leagueId);
    void loadNotes(leagueId);
  }, [leagueId, loadWatchlist, loadNotes]);

  const filteredWatchlist = useMemo(() => {
    if (viewFilter === "all") return watchlist;
    if (viewFilter === "pitchers") return watchlist.filter(isPitcher);
    return watchlist.filter((player) => !isPitcher(player));
  }, [watchlist, viewFilter]);

  const totalPlannedBudget = useMemo(
    () => allocationRows.reduce((sum, row) => sum + row.target, 0),
    [allocationRows],
  );

  const plannedRemaining = totalBudget - totalPlannedBudget;

  const positionAlerts = useMemo(() => {
    return allocationRows
      .map((row) => {
        const target = row.target;
        const delta = target - 0;
        return {
          pos: row.pos,
          target,
          delta,
        };
      })
      .filter((row) => row.target > totalBudget * 0.22 || row.target < 5);
  }, [allocationRows, totalBudget]);

  const watchlistRows = useMemo(() => {
    return filteredWatchlist.map((player) => {
      const bucket = getPositionBucket(player);
      return {
        player,
        bucket,
        target:
          targetOverrides[player.id] ??
          positionTargets[bucket] ??
          player.value,
        priority: priorityOverrides[player.id] ?? "Medium",
      };
    });
  }, [filteredWatchlist, positionTargets, priorityOverrides, targetOverrides]);

  function handleOpenPlayer(player: WatchlistPlayer) {
    setSelectedPlayer(watchlistToPlayer(player));
    navigation.navigate("CommandCenter", { leagueId });
  }

  function handleChangePositionTarget(pos: string, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const next = { ...positionTargets, [pos]: parsed };
    void setPositionTargets(next);
  }

  function handleChangePlayerTarget(playerId: string, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const next = { ...targetOverrides, [playerId]: parsed };
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
          <Text>Scoring: 5x5 Roto</Text>
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
                  width: `${(row.target / totalBudget) * 100}%`,
                  backgroundColor: row.color,
                }}
              />
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

        <AppCard>
          <Text style={{ fontWeight: "700", marginBottom: 10 }}>
            Watchlist Planner
          </Text>

          {watchlistRows.length === 0 ? (
            <EmptyState label="No watchlist players yet." />
          ) : (
            watchlistRows.map(({ player, bucket, target, priority }, index) => (
              <View
                key={player.id}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#f1f5f9",
                }}
              >
                <TouchableOpacity onPress={() => handleOpenPlayer(player)}>
                  <Text style={{ fontWeight: "600" }}>{player.name}</Text>
                  <Text style={{ color: "#4b5563", marginTop: 2 }}>
                    {player.team} • {player.position} • ADP {player.adp}
                  </Text>
                  <Text style={{ color: "#4b5563", marginTop: 2 }}>
                    Bucket {bucket} • List ${player.value}
                  </Text>
                </TouchableOpacity>

                <Text style={{ marginTop: 8, fontWeight: "600" }}>
                  Target Price
                </Text>
                <TextInput
                  defaultValue={String(target)}
                  keyboardType="numeric"
                  onEndEditing={(event) =>
                    handleChangePlayerTarget(player.id, event.nativeEvent.text)
                  }
                  style={{
                    borderWidth: 1,
                    borderColor: "#cbd5e1",
                    borderRadius: 8,
                    padding: 10,
                    backgroundColor: "white",
                    marginTop: 8,
                    marginBottom: 10,
                  }}
                />

                <Text style={{ marginBottom: 8, fontWeight: "600" }}>
                  Priority
                </Text>
                <View style={{ flexDirection: "row", marginBottom: 10 }}>
                  {(["High", "Medium", "Low"] as Priority[]).map((label) => (
                    <AppChip
                      key={label}
                      label={label}
                      selected={priority === label}
                      onPress={() => handleChangePriority(player.id, label)}
                      style={{ marginRight: 8 }}
                    />
                  ))}
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <AppChip
                    label="Open"
                    selected
                    onPress={() => handleOpenPlayer(player)}
                    style={{ marginRight: 8, marginBottom: 8 }}
                  />

                  <AppChip
                    label="Remove"
                    tone="danger"
                    onPress={() => void removeFromWatchlist(leagueId, player.id)}
                    style={{ marginBottom: 8 }}
                  />
                </View>
              </View>
            ))
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