import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import {
  getDepthChartCached,
  getPlayers,
  getPlayersCached,
  getTeamDepthChart,
  type DepthChartPlayerRow,
  type DepthChartPosition,
  type DepthChartResponse,
} from "../api/players";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import {
  type StatBasis,
  formatResearchStatSummaryLine,
  parseStatBasis,
  RESEARCH_STAT_BASIS_STORAGE_KEY_MOBILE,
} from "@repo/player-stat-basis";

type Props = BottomTabScreenProps<LeagueTabParamList, "Research">;

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
  const [statBasis, setStatBasis] = useState<StatBasis>("last-year");

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

  useEffect(() => {
    void loadWatchlist(leagueId);
  }, [leagueId, loadWatchlist]);

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

        const customPlayerIdSet = new Set(customPlayers.map((player) => player.id));
        const merged = new Map<string, ValuationResult>();

        for (const row of response.valuations) {
          if (customPlayerIdSet.has(row.player_id)) continue;
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
  }, [token, leagueId, players.length, customPlayers]);

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

  const allPlayers = useMemo(
    () => [...customPlayers, ...players],
    [customPlayers, players],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allPlayers.filter((player) => {
      const nameMatch = player.name.toLowerCase().includes(q);
      const posMatch = positionMatches(player, positionFilter);
      return nameMatch && posMatch;
    });
  }, [allPlayers, search, positionFilter]);

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

  function handleOpenPlayer(player: Player) {
    setSelectedPlayer(player);
    navigation.navigate("CommandCenter", { leagueId });
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
        "Watchlist error",
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

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
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
            label="Depth"
            selected={selectedView === "depth-charts"}
            fullWidth
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
              <AppChip
                key={filter}
                label={filter}
                selected={positionFilter === filter}
                onPress={() => setPositionFilter(filter)}
                style={{ marginRight: 8 }}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            <AppChip
              label="PROJ"
              selected={statBasis === "projections"}
              onPress={() => setStatBasis("projections")}
              style={{ marginRight: 8 }}
            />
            <AppChip
              label="2025"
              selected={statBasis === "last-year"}
              onPress={() => setStatBasis("last-year")}
              style={{ marginRight: 8 }}
            />
            <AppChip
              label="3YR"
              selected={statBasis === "3-year-avg"}
              onPress={() => setStatBasis("3-year-avg")}
              style={{ marginRight: 8 }}
            />
          </ScrollView>

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
            <AppCard backgroundColor="#fafafa">
              <Text style={{ fontWeight: "700", marginBottom: 10 }}>
                {editingCustomPlayerId ? "Edit Custom Player" : "Add Custom Player"}
              </Text>

              <TextInput
                value={newPlayerName}
                onChangeText={setNewPlayerName}
                placeholder="Name"
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginBottom: 8,
                }}
              />

              <TextInput
                value={newPlayerTeam}
                onChangeText={setNewPlayerTeam}
                placeholder="Team"
                autoCapitalize="characters"
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginBottom: 8,
                }}
              />

              <TextInput
                value={newPlayerPosition}
                onChangeText={setNewPlayerPosition}
                placeholder="Position e.g. OF or SP"
                autoCapitalize="characters"
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginBottom: 8,
                }}
              />

              <TextInput
                value={newPlayerAdp}
                onChangeText={setNewPlayerAdp}
                placeholder="ADP"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginBottom: 8,
                }}
              />

              <TextInput
                value={newPlayerValue}
                onChangeText={setNewPlayerValue}
                placeholder="Value"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginBottom: 8,
                }}
              />

              <TextInput
                value={newPlayerTier}
                onChangeText={setNewPlayerTier}
                placeholder="Tier"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "white",
                  marginBottom: 10,
                }}
              />

              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <TouchableOpacity
                  onPress={() => void handleSaveCustomPlayer()}
                  style={{
                    alignSelf: "flex-start",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: "#111827",
                    marginRight: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
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
                    backgroundColor: "#e5e7eb",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "#111827", fontWeight: "700" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </AppCard>
          ) : null}

          {playersError ? <ErrorState label={playersError} /> : null}

          {loadingPlayers ? (
            <LoadingState label="Loading players..." />
          ) : selectedView === "player-database" ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ marginBottom: 12, color: "#4b5563" }}>
                Showing {filteredPlayers.length} players • Watchlist {watchlist.length}
              </Text>

              {filteredPlayers.length === 0 ? (
                <EmptyState label="No players found." />
              ) : (
                filteredPlayers.map((item) => {
                  const watched = isInWatchlist(leagueId, item.id);
                  const engineRow = valuationsByPlayerId.get(item.id);
                  const displayTier = engineRow?.tier ?? item.tier;
                  const displayValue = engineRow?.adjusted_value ?? item.value;
                  const statSummary = formatResearchStatSummaryLine(item, statBasis);
                  const custom = isCustomPlayer(item.id);

                  return (
                    <AppCard key={item.id}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => handleOpenPlayer(item)}
                          style={{ flex: 1, marginRight: 12 }}
                        >
                          <Text style={{ fontWeight: "600", marginBottom: 2 }}>
                            {item.name}
                            {custom ? " • Custom" : ""}
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
                          {statSummary ? (
                            <Text numberOfLines={2} style={{ color: "#6b7280", marginTop: 4 }}>
                              {statSummary}
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

                        <View>
                          <AppChip
                            label={watched ? "Saved" : "Save"}
                            selected={watched}
                            onPress={() => void handleToggleWatchlist(item)}
                            style={{ marginBottom: custom ? 8 : 0 }}
                          />

                          {custom ? (
                            <>
                              <AppChip
                                label="Edit"
                                tone="info"
                                onPress={() => startEditingCustomPlayer(item)}
                                style={{ marginBottom: 8 }}
                              />

                              <AppChip
                                label="Remove"
                                tone="danger"
                                onPress={() => void removeCustomPlayer(item.id)}
                              />
                            </>
                          ) : null}
                        </View>
                      </View>
                    </AppCard>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ marginBottom: 12, color: "#4b5563" }}>
                {filteredPlayers.length} filtered players across {tierBuckets.length} tiers
              </Text>

              {tierBuckets.length === 0 ? (
                <EmptyState label="No tiers found." />
              ) : (
                tierBuckets.map((bucket) => (
                  <AppCard key={bucket.tier}>
                    <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                      Tier {bucket.tier}
                    </Text>

                    {bucket.players.slice(0, 15).map((player, index) => {
                      const engineRow = valuationsByPlayerId.get(player.id);
                      const displayValue = engineRow?.adjusted_value ?? player.value;
                      const watched = isInWatchlist(leagueId, player.id);
                      const statSummary = formatResearchStatSummaryLine(player, statBasis);
                      const custom = isCustomPlayer(player.id);

                      return (
                        <View
                          key={player.id}
                          style={{
                            paddingVertical: 10,
                            borderTopWidth: index === 0 ? 0 : 1,
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
                            <Text style={{ fontWeight: "600" }}>
                              {player.name}
                              {custom ? " • Custom" : ""}
                            </Text>
                            <Text>
                              {player.team} • {player.position} • ${displayValue}
                            </Text>
                            {statSummary ? (
                              <Text numberOfLines={2} style={{ color: "#6b7280", marginTop: 4 }}>
                                {statSummary}
                              </Text>
                            ) : null}
                          </TouchableOpacity>

                          <AppChip
                            label={watched ? "Saved" : "Save"}
                            selected={watched}
                            onPress={() => void handleToggleWatchlist(player)}
                          />
                        </View>
                      );
                    })}

                    {bucket.players.length > 15 ? (
                      <Text style={{ color: "#6b7280", marginTop: 8 }}>
                        +{bucket.players.length - 15} more players in this tier
                      </Text>
                    ) : null}
                  </AppCard>
                ))
              )}
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
              <AppChip
                key={team.id}
                label={team.abbr}
                selected={selectedDepthTeamId === team.id}
                tone="info"
                onPress={() => setSelectedDepthTeamId(team.id)}
                style={{ marginRight: 8 }}
              />
            ))}
          </ScrollView>

          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <AppChip
              label="Refresh"
              selected
              onPress={() => void loadDepthChart(selectedDepthTeamId, true)}
            />
          </View>

          {depthChartError ? <ErrorState label={depthChartError} /> : null}

          {isLoadingDepthChart ? (
            <LoadingState label="Loading depth chart..." />
          ) : !depthChartData ? (
            <EmptyState label="No depth chart data available." />
          ) : (
            <>
              <AppCard backgroundColor="#f9fafb">
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
              </AppCard>

              {DEPTH_POSITIONS.map((position) => {
                const rows = depthChartData.positions[position] ?? [];

                return (
                  <AppCard key={position}>
                    <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                      {position} • {rows.length}/3
                    </Text>

                    {[1, 2, 3].map((rank, index) => {
                      const row = rows.find((item) => item.rank === rank);

                      if (!row) {
                        return (
                          <View
                            key={`${position}-${rank}`}
                            style={{
                              paddingVertical: 10,
                              borderTopWidth: index === 0 ? 0 : 1,
                              borderTopColor: "#f1f5f9",
                            }}
                          >
                            <Text style={{ fontWeight: "600", marginBottom: 4 }}>
                              #{rank}
                            </Text>
                            <Text style={{ color: "#6b7280" }}>No assignment</Text>
                          </View>
                        );
                      }

                      const matchedPlayer =
                        allPlayers.find(
                          (player) =>
                            player.mlbId === row.playerId ||
                            player.id === String(row.playerId),
                        ) ?? null;

                      const isSaved = matchedPlayer
                        ? isInWatchlist(leagueId, matchedPlayer.id)
                        : false;

                      return (
                        <View
                          key={`${position}-${rank}`}
                          style={{
                            paddingVertical: 10,
                            borderTopWidth: index === 0 ? 0 : 1,
                            borderTopColor: "#f1f5f9",
                          }}
                        >
                          <Text style={{ fontWeight: "600", marginBottom: 4 }}>
                            #{rank}
                          </Text>

                          <TouchableOpacity onPress={() => void handleDepthPlayerPress(row)}>
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
                            <AppChip
                              label={isSaved ? "Saved" : "Save"}
                              selected={isSaved}
                              onPress={() => void handleDepthStarToggle(row)}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </AppCard>
                );
              })}

              {depthChartData.manualReview.length > 0 ? (
                <AppCard backgroundColor="#fef2f2" borderColor="#fecaca">
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
                </AppCard>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}