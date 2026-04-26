import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getValuation, type ValuationResult } from "../api/engine";
import {
  getDepthChartCached,
  getPlayers,
  getPlayersCached,
  getTeamDepthChart,
  type DepthChartPlayerRow,
  type DepthChartPosition,
  type DepthChartResponse,
} from "../api/players";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { Player } from "../types/player";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { LeagueTabParamList } from "../navigation/types";

type ResearchView = "player-database" | "tiers" | "depth-charts";
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

  if (direct || multi) return true;

  if (filter === "OF") {
    return ["LF", "CF", "RF"].some((p) =>
      player.position.toUpperCase().includes(p),
    );
  }

  return false;
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

type Props = BottomTabScreenProps<LeagueTabParamList, "Research">;
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

  const league = allLeagues.find((item) => item.id === leagueId);
  const watchlist = getWatchlistForLeague(leagueId);

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

  const [selectedDepthTeamId, setSelectedDepthTeamId] = useState(147);
  const [depthChartData, setDepthChartData] = useState<DepthChartResponse | null>(
    () => getDepthChartCached(147),
  );
  const [isLoadingDepthChart, setIsLoadingDepthChart] = useState(
    () => getDepthChartCached(147) === null,
  );
  const [depthChartError, setDepthChartError] = useState("");

  useEffect(() => {
    void loadWatchlist(leagueId);
  }, [leagueId, loadWatchlist]);

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

    void getValuation(leagueId, token, "team_1")
      .then((response) => {
        if (cancelled) return;

        const merged = new Map<string, ValuationResult>();
        for (const row of response.valuations) {
          merged.set(row.player_id, row);
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
  }, [token, leagueId, players.length]);

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

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return players.filter((player) => {
      const nameMatch = player.name.toLowerCase().includes(q);
      const posMatch = positionMatches(player, positionFilter);
      return nameMatch && posMatch;
    });
  }, [players, search, positionFilter]);

  const tierBuckets = useMemo(() => {
    const grouped = new Map<number, Player[]>();

    for (const player of filteredPlayers) {
      const engineRow = valuationsByPlayerId.get(player.id);
      const tier = engineRow?.tier ?? player.tier;

      if (!grouped.has(tier)) {
        grouped.set(tier, []);
      }

      grouped.get(tier)!.push(player);
    }

    const sortedTiers = Array.from(grouped.keys()).sort((a, b) => a - b);

    return sortedTiers.map((tier) => ({
      tier,
      players: (grouped.get(tier) ?? []).sort((a, b) => {
        const aValue = valuationsByPlayerId.get(a.id)?.adjusted_value ?? a.value;
        const bValue = valuationsByPlayerId.get(b.id)?.adjusted_value ?? b.value;
        return bValue - aValue;
      }),
    }));
  }, [filteredPlayers, valuationsByPlayerId]);

  const depthTotalSlots = DEPTH_POSITIONS.length * 3;
  const depthAssignedCount = useMemo(() => {
    if (!depthChartData) return 0;

    return DEPTH_POSITIONS.reduce(
      (total, position) => total + (depthChartData.positions[position]?.length ?? 0),
      0,
    );
  }, [depthChartData]);

  function handleOpenPlayer(player: Player) {
    setSelectedPlayer(player);
    navigation.navigate("CommandCenter", { leagueId });
  }

  async function resolveDepthPlayer(
    slot: DepthChartPlayerRow,
  ): Promise<Player | null> {
    const existing =
      players.find(
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
          `Could not star ${slot.playerName}. Player record was not found.`,
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
        "Watchlist error",
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
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
        <View style={{ flex: 1, marginRight: 8 }}>
          <SegmentButton
            label="Tiers"
            selected={selectedView === "tiers"}
            onPress={() => setSelectedView("tiers")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SegmentButton
            label="Depth"
            selected={selectedView === "depth-charts"}
            onPress={() => setSelectedView("depth-charts")}
          />
        </View>
      </View>

      {selectedView === "player-database" || selectedView === "tiers" ? (
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

          {playersError ? (
            <Text style={{ color: "#b91c1c", marginBottom: 12 }}>
              {playersError}
            </Text>
          ) : null}

          {loadingPlayers ? (
            <ActivityIndicator />
          ) : selectedView === "player-database" ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ marginBottom: 12, color: "#4b5563" }}>
                Showing {filteredPlayers.length} players • Watchlist {watchlist.length}
              </Text>

              {filteredPlayers.map((item) => {
                const watched = isInWatchlist(leagueId, item.id);
                const engineRow = valuationsByPlayerId.get(item.id);
                const displayTier = engineRow?.tier ?? item.tier;
                const displayValue = engineRow?.adjusted_value ?? item.value;

                return (
                  <View
                    key={item.id}
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
                        ${displayValue}
                        {engineRow ? ` • Eng Tier ${displayTier}` : ` • Tier ${displayTier}`}
                      </Text>
                      {engineRow?.indicator ? (
                        <Text style={{ color: "#6b7280", marginTop: 2 }}>
                          {engineRow.indicator}
                        </Text>
                      ) : null}
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
              })}

              {filteredPlayers.length === 0 ? <Text>No players found.</Text> : null}
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ marginBottom: 12, color: "#4b5563" }}>
                {filteredPlayers.length} filtered players across {tierBuckets.length} tiers
              </Text>

              {tierBuckets.map((bucket) => (
                <View
                  key={bucket.tier}
                  style={{
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                    Tier {bucket.tier}
                  </Text>

                  {bucket.players.slice(0, 15).map((player) => {
                    const engineRow = valuationsByPlayerId.get(player.id);
                    const displayValue = engineRow?.adjusted_value ?? player.value;
                    const watched = isInWatchlist(leagueId, player.id);

                    return (
                      <View
                        key={player.id}
                        style={{
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: "#f1f5f9",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => handleOpenPlayer(player)}
                          style={{ flex: 1, marginRight: 12 }}
                        >
                          <Text style={{ fontWeight: "600" }}>{player.name}</Text>
                          <Text>
                            {player.team} • {player.position} • ${displayValue}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => void handleToggleWatchlist(player)}
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
                  })}

                  {bucket.players.length > 15 ? (
                    <Text style={{ color: "#6b7280", marginTop: 8 }}>
                      +{bucket.players.length - 15} more players in this tier
                    </Text>
                  ) : null}
                </View>
              ))}

              {tierBuckets.length === 0 ? <Text>No tiers found.</Text> : null}
            </ScrollView>
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

          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => void loadDepthChart(selectedDepthTeamId, true)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: "#111827",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Refresh</Text>
            </TouchableOpacity>
          </View>

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
                <Text>Assignments {depthAssignedCount}/{depthTotalSlots}</Text>
                <Text>Manual review {depthChartData.manualReview.length}</Text>
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
                      {position} • {rows.length}/3
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
                              <TouchableOpacity
                                onPress={() => void handleDepthPlayerPress(row)}
                              >
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
                              </TouchableOpacity>

                              <View style={{ marginTop: 8 }}>
                                <TouchableOpacity
                                  onPress={() => void handleDepthStarToggle(row)}
                                  style={{
                                    alignSelf: "flex-start",
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    backgroundColor: "#f3f4f6",
                                  }}
                                >
                                  <Text style={{ fontWeight: "600" }}>
                                    {isInWatchlist(leagueId, String(row.playerId))
                                      ? "Saved"
                                      : "Save"}
                                  </Text>
                                </TouchableOpacity>
                              </View>
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