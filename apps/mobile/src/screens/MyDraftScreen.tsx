import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { WatchlistPlayer } from "../api/watchlist";
import type { Player } from "../types/player";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { LeagueTabParamList } from "../navigation/types";

type ViewFilter = "all" | "hitters" | "pitchers";
type Priority = "High" | "Medium" | "Low";

type PositionPlanRow = {
  pos: string;
  slots: number;
  target: number;
};

const POSITION_PLAN: PositionPlanRow[] = [
  { pos: "C", slots: 1, target: 14 },
  { pos: "1B", slots: 1, target: 28 },
  { pos: "2B", slots: 1, target: 22 },
  { pos: "SS", slots: 1, target: 25 },
  { pos: "3B", slots: 1, target: 24 },
  { pos: "OF", slots: 3, target: 44 },
  { pos: "SP", slots: 2, target: 60 },
  { pos: "RP", slots: 2, target: 20 },
  { pos: "UTIL", slots: 1, target: 15 },
  { pos: "BN", slots: 4, target: 8 },
];

const POS_COLORS: Record<string, string> = {
  C: "#f87171",
  "1B": "#fbbf24",
  "2B": "#38bdf8",
  "3B": "#fb923c",
  SS: "#22d3ee",
  OF: "#4ade80",
  SP: "#818cf8",
  RP: "#f472b6",
  UTIL: "#94a3b8",
  BN: "#6b7280",
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

function loadDefaultPositionTargets(): Record<string, number> {
  return Object.fromEntries(POSITION_PLAN.map((row) => [row.pos, row.target]));
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
  if (positions.includes("OF") || positions.includes("LF") || positions.includes("CF") || positions.includes("RF")) {
    return "OF";
  }
  if (positions.includes("SP")) return "SP";
  if (positions.includes("RP")) return "RP";
  if (positions.includes("UTIL") || positions.includes("UT")) return "UTIL";
  return isPitcher(player) ? "SP" : "UTIL";
}

function PriorityChip({
  label,
  selected,
  onPress,
}: {
  label: Priority;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? "#111827" : "#d1d5db",
        backgroundColor: selected ? "#111827" : "white",
        marginRight: 8,
      }}
    >
      <Text style={{ color: selected ? "white" : "#111827", fontWeight: "600" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FilterChip({
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
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? "#111827" : "#d1d5db",
        backgroundColor: selected ? "#111827" : "white",
        marginRight: 8,
      }}
    >
      <Text style={{ color: selected ? "white" : "#111827", fontWeight: "600" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

type Props = BottomTabScreenProps<LeagueTabParamList, "MyDraft">;
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

  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [positionTargets, setPositionTargets] = useState<Record<string, number>>(
    loadDefaultPositionTargets(),
  );
  const [targetOverrides, setTargetOverrides] = useState<Record<string, number>>(
    {},
  );
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, Priority>
  >({});

  useEffect(() => {
    void loadWatchlist(leagueId);
    void loadNotes(leagueId);
  }, [leagueId, loadWatchlist, loadNotes]);

  useEffect(() => {
    async function loadPlannerState() {
      try {
        const targetsRaw = await AsyncStorage.getItem(
          `mydraft:${leagueId}:positionTargets`,
        );
        const targetOverridesRaw = await AsyncStorage.getItem(
          `mydraft:${leagueId}:targetOverrides`,
        );
        const priorityOverridesRaw = await AsyncStorage.getItem(
          `mydraft:${leagueId}:priorityOverrides`,
        );

        setPositionTargets({
          ...loadDefaultPositionTargets(),
          ...(targetsRaw ? JSON.parse(targetsRaw) : {}),
        });

        setTargetOverrides(targetOverridesRaw ? JSON.parse(targetOverridesRaw) : {});
        setPriorityOverrides(
          priorityOverridesRaw ? JSON.parse(priorityOverridesRaw) : {},
        );
      } catch {
        setPositionTargets(loadDefaultPositionTargets());
        setTargetOverrides({});
        setPriorityOverrides({});
      }
    }

    void loadPlannerState();
  }, [leagueId]);

  async function savePositionTargets(next: Record<string, number>) {
    setPositionTargets(next);
    await AsyncStorage.setItem(
      `mydraft:${leagueId}:positionTargets`,
      JSON.stringify(next),
    );
  }

  async function saveTargetOverrides(next: Record<string, number>) {
    setTargetOverrides(next);
    await AsyncStorage.setItem(
      `mydraft:${leagueId}:targetOverrides`,
      JSON.stringify(next),
    );
  }

  async function savePriorityOverrides(next: Record<string, Priority>) {
    setPriorityOverrides(next);
    await AsyncStorage.setItem(
      `mydraft:${leagueId}:priorityOverrides`,
      JSON.stringify(next),
    );
  }

  const filteredWatchlist = useMemo(() => {
    if (viewFilter === "all") return watchlist;
    if (viewFilter === "pitchers") return watchlist.filter(isPitcher);
    return watchlist.filter((player) => !isPitcher(player));
  }, [watchlist, viewFilter]);

  const allocationRows = useMemo(() => {
    return POSITION_PLAN.map((row) => ({
      ...row,
      target: positionTargets[row.pos] ?? row.target,
      color: POS_COLORS[row.pos] ?? "#9ca3af",
    }));
  }, [positionTargets]);

  const totalPlannedBudget = useMemo(
    () => allocationRows.reduce((sum, row) => sum + row.target, 0),
    [allocationRows],
  );

  const plannedRemaining = totalBudget - totalPlannedBudget;

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
    void savePositionTargets(next);
  }

  function handleChangePlayerTarget(playerId: string, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const next = { ...targetOverrides, [playerId]: parsed };
    void saveTargetOverrides(next);
  }

  function handleChangePriority(playerId: string, priority: Priority) {
    const next = { ...priorityOverrides, [playerId]: priority };
    void savePriorityOverrides(next);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
          My Draft
        </Text>

        <View
          style={{
            padding: 16,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>League Summary</Text>
          <Text style={{ marginBottom: 6 }}>League: {league?.name ?? "Unknown"}</Text>
          <Text style={{ marginBottom: 6 }}>Budget: ${totalBudget}</Text>
          <Text style={{ marginBottom: 6 }}>Watchlist: {watchlist.length}</Text>
          <Text>Scoring: 5x5 Roto</Text>
        </View>

        <View
          style={{
            padding: 16,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
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
        </View>

        <View
          style={{
            padding: 16,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontWeight: "700", marginBottom: 10 }}>
            Position Targets
          </Text>

          {allocationRows.map((row) => (
            <View
              key={row.pos}
              style={{
                paddingVertical: 10,
                borderTopWidth: 1,
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
        </View>

        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <FilterChip
              label="All"
              selected={viewFilter === "all"}
              onPress={() => setViewFilter("all")}
            />
            <FilterChip
              label="Hitters"
              selected={viewFilter === "hitters"}
              onPress={() => setViewFilter("hitters")}
            />
            <FilterChip
              label="Pitchers"
              selected={viewFilter === "pitchers"}
              onPress={() => setViewFilter("pitchers")}
            />
          </ScrollView>
        </View>

        <View
          style={{
            padding: 16,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontWeight: "700", marginBottom: 10 }}>
            Watchlist Planner
          </Text>

          {watchlistRows.length === 0 ? (
            <Text>No watchlist players yet.</Text>
          ) : (
            watchlistRows.map(({ player, bucket, target, priority }) => (
              <View
                key={player.id}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: 1,
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
                    <PriorityChip
                      key={label}
                      label={label}
                      selected={priority === label}
                      onPress={() => handleChangePriority(player.id, label)}
                    />
                  ))}
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <TouchableOpacity
                    onPress={() => handleOpenPlayer(player)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: "#111827",
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>
                      Open
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => void removeFromWatchlist(leagueId, player.id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: "#fee2e2",
                    }}
                  >
                    <Text style={{ color: "#991b1b", fontWeight: "600" }}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View
          style={{
            padding: 16,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}