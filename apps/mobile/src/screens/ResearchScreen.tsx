import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getDepthChartCached,
  getPlayers,
  getTeamDepthChart,
  type DepthChartPosition,
  type DepthChartResponse,
} from "../api/players";
import { getCatalogBatchValues } from "../api/engine";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { Player } from "../types/player";

type ResearchView = "player-database" | "depth-charts";
type PositionFilter =
  | "ALL"
  | "C"
  | "1B"
  | "2B"
  | "SS"
  | "3B"
  | "OF"
  | "SP"
  | "RP"
  | "UTIL";

const POSITION_FILTERS: PositionFilter[] = [
  "ALL",
  "C",
  "1B",
  "2B",
  "SS",
  "3B",
  "OF",
  "SP",
  "RP",
  "UTIL",
];

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

function positionMatches(player: Player, filter: PositionFilter): boolean {
  if (filter === "ALL") return true;

  const direct = player.position
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .includes(filter);

  const multi = (player.positions ?? []).map((p) => p.toUpperCase()).includes(filter);

  return direct || multi;
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
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: selected ? "#111827" : "#d1d5db",
        backgroundColor: selected ? "#111827" : "white",
        alignItems: "center",
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

function TeamChip({
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
        borderColor: selected ? "#1d4ed8" : "#d1d5db",
        backgroundColor: selected ? "#dbeafe" : "white",
        marginRight: 8,
      }}
    >
      <Text style={{ color: "#111827", fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ResearchScreen({ route, navigation }: any) {
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

  const [selectedView, setSelectedView] =
    useState<ResearchView>("player-database");

  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] =
    useState<PositionFilter>("ALL");
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  const [engineCatalogByPlayerId, setEngineCatalogByPlayerId] = useState<
    ReadonlyMap<string, { value: number; tier: number }>
  >(new Map());

  const [selectedDepthTeamId, setSelectedDepthTeamId] = useState(147);
  const [depthChartData, setDepthChartData] = useState<DepthChartResponse | null>(
    () => getDepthChartCached(147),
  );
  const [isLoadingDepthChart, setIsLoadingDepthChart] = useState(
    () => getDepthChartCached(147) === null,
  );
  const [depthChartError, setDepthChartError] = useState("");

  const league = allLeagues.find((item) => item.id === leagueId);
  const watchlist = getWatchlistForLeague(leagueId);

  useEffect(() => {
    void loadWatchlist(leagueId);
  }, [leagueId, loadWatchlist]);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const data = await getPlayers(
          "adp",
          league?.posEligibilityThreshold,
          league?.playerPool,
        );
        setPlayers(data);
      } finally {
        setLoadingPlayers(false);
      }
    }

    void loadPlayers();
  }, [league?.playerPool, league?.posEligibilityThreshold, leagueId]);

  useEffect(() => {
    if (!token || players.length === 0) {
      setEngineCatalogByPlayerId(new Map());
      return;
    }

    const pool = league?.playerPool ?? "Mixed";
    const BATCH = 150;
    let cancelled = false;

    const ids = players.map((p) => p.id);

    void (async () => {
      const merged = new Map<string, { value: number; tier: number }>();

      for (let i = 0; i < ids.length; i += BATCH) {
        if (cancelled) return;

        const chunk = ids.slice(i, i + BATCH);
        if (chunk.length === 0) continue;

        try {
          const res = await getCatalogBatchValues(token, {
            player_ids: chunk,
            league_scope: pool,
            pos_eligibility_threshold: league?.posEligibilityThreshold,
          });

          for (const row of res.players) {
            merged.set(row.player_id, {
              value: row.value,
              tier: row.tier,
            });
          }
        } catch {
          if (!cancelled) {
            setEngineCatalogByPlayerId(new Map());
          }
          return;
        }
      }

      if (!cancelled) {
        setEngineCatalogByPlayerId(merged);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, players, league?.playerPool, league?.posEligibilityThreshold]);

  const loadDepthChart = useCallback(async (teamId: number) => {
    const cached = getDepthChartCached(teamId);

    if (!cached) {
      setIsLoadingDepthChart(true);
    }

    setDepthChartError("");

    try {
      const depth = await getTeamDepthChart(teamId);
      setDepthChartData(depth);
    } catch (err) {
      setDepthChartError(
        err instanceof Error ? err.message : "Failed to load depth chart",
      );
    } finally {
      setIsLoadingDepthChart(false);
    }
  }, []);

  useEffect(() => {
    if (selectedView !== "depth-charts") return;
    void loadDepthChart(selectedDepthTeamId);
  }, [loadDepthChart, selectedDepthTeamId, selectedView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return players.filter((player) => {
      const nameMatch = player.name.toLowerCase().includes(q);
      const posMatch = positionMatches(player, positionFilter);
      return nameMatch && posMatch;
    });
  }, [players, search, positionFilter]);

  async function handleToggleWatchlist(player: Player) {
    try {
      if (isInWatchlist(leagueId, player.id)) {
        await removeFromWatchlist(leagueId, player.id);
      } else {
        await addToWatchlist(leagueId, player);
      }
    } catch (err) {
      Alert.alert(
        "Watchlist error",
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
  }

  function handleOpenPlayer(player: Player) {
    setSelectedPlayer(player);
    navigation.navigate("CommandCenter", { leagueId });
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: "row", marginBottom: 14 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <SegmentButton
            label="Players"
            selected={selectedView === "player-database"}
            onPress={() => setSelectedView("player-database")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SegmentButton
            label="Depth Charts"
            selected={selectedView === "depth-charts"}
            onPress={() => setSelectedView("depth-charts")}
          />
        </View>
      </View>

      {selectedView === "player-database" ? (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search players"
            style={{
              borderWidth: 1,
              borderColor: "#d1d5db",
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
            }}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            {POSITION_FILTERS.map((filter) => (
              <FilterChip
                key={filter}
                label={filter}
                selected={positionFilter === filter}
                onPress={() => setPositionFilter(filter)}
              />
            ))}
          </ScrollView>

          <Text style={{ marginBottom: 12, color: "#4b5563" }}>
            Showing {filtered.length} players • Watchlist {watchlist.length}
          </Text>

          {loadingPlayers ? (
            <ActivityIndicator />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const watched = isInWatchlist(leagueId, item.id);
                const eng = engineCatalogByPlayerId.get(item.id);

                return (
                  <View
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#eee",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => handleOpenPlayer(item)}
                      style={{ flex: 1, marginRight: 12 }}
                    >
                      <Text style={{ fontWeight: "600", marginBottom: 2 }}>
                        {item.name}
                      </Text>
                      <Text>
                        {item.team} • {item.position} • ADP {item.adp}
                      </Text>
                      <Text>
                        List ${item.value}
                        {eng ? ` • Eng $${eng.value}` : ""}
                      </Text>
                      <Text>
                        List Tier {item.tier}
                        {eng ? ` • Eng Tier ${eng.tier}` : ""}
                      </Text>
                      {!!item.outlook && (
                        <Text
                          numberOfLines={2}
                          style={{ color: "#6b7280", marginTop: 4 }}
                        >
                          {item.outlook}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => void handleToggleWatchlist(item)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: watched ? "#111827" : "#e5e7eb",
                      }}
                    >
                      <Text style={{ color: watched ? "white" : "black" }}>
                        {watched ? "Saved" : "Save"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={<Text>No players found.</Text>}
            />
          )}
        </>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            {MLB_TEAMS.map((team) => (
              <TeamChip
                key={team.id}
                label={team.abbr}
                selected={selectedDepthTeamId === team.id}
                onPress={() => setSelectedDepthTeamId(team.id)}
              />
            ))}
          </ScrollView>

          {depthChartError ? (
            <Text style={{ color: "#b91c1c", marginBottom: 12 }}>
              {depthChartError}
            </Text>
          ) : null}

          {isLoadingDepthChart ? (
            <ActivityIndicator />
          ) : !depthChartData ? (
            <Text>No depth chart data available.</Text>
          ) : (
            <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  borderRadius: 12,
                  padding: 14,
                  backgroundColor: "#f9fafb",
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                  Team Depth Summary
                </Text>
                <Text>
                  Updated {new Date(depthChartData.generatedAt).toLocaleString()}
                </Text>
                <Text>
                  Roster {depthChartData.rosterCount}/{depthChartData.rosterLimit}
                </Text>
                <Text style={{ marginTop: 4 }}>
                  {depthChartData.constraints.note}
                </Text>
              </View>

              {DEPTH_POSITIONS.map((position) => {
                const rows = depthChartData.positions[position] ?? [];

                return (
                  <View
                    key={position}
                    style={{
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                      {position}
                    </Text>

                    {[1, 2, 3].map((rank) => {
                      const row = rows.find((item) => item.rank === rank);

                      return (
                        <View
                          key={`${position}-${rank}`}
                          style={{
                            paddingVertical: 10,
                            borderTopWidth: rank === 1 ? 0 : 1,
                            borderTopColor: "#f1f5f9",
                          }}
                        >
                          <Text style={{ fontWeight: "600", marginBottom: 4 }}>
                            #{rank}
                          </Text>

                          {row ? (
                            <>
                              <Text>{row.playerName}</Text>
                              <Text style={{ color: "#4b5563", marginTop: 2 }}>
                                {row.primaryPosition} • {row.status}
                              </Text>
                              <Text style={{ color: "#4b5563" }}>
                                {row.usageStarts} starts • {row.usageAppearances} apps
                              </Text>
                              {row.outOfPosition || row.needsManualReview ? (
                                <Text style={{ color: "#b91c1c", marginTop: 4 }}>
                                  OOF / Manual Review
                                </Text>
                              ) : null}
                            </>
                          ) : (
                            <Text style={{ color: "#6b7280" }}>No assignment</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}

              {depthChartData.manualReview.length > 0 ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#fecaca",
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: "#fef2f2",
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ fontWeight: "700", marginBottom: 8 }}>
                    Manual Review Required
                  </Text>
                  {depthChartData.manualReview.map((item) => (
                    <Text
                      key={`${item.playerId}-${item.requestedPosition}`}
                      style={{ marginBottom: 6 }}
                    >
                      {item.playerName} — {item.requestedPosition} ({item.reason})
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}