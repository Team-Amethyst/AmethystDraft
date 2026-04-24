import { useEffect, useMemo, useState } from "react";
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
import { getPlayers } from "../api/players";
import { useLeague } from "../contexts/LeagueContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { Player } from "../types/player";

const POSITION_FILTERS = [
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
] as const;

type PositionFilter = (typeof POSITION_FILTERS)[number];

function positionMatches(player: Player, filter: PositionFilter): boolean {
  if (filter === "ALL") return true;

  const direct = player.position
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .includes(filter);

  const multi = (player.positions ?? []).map((p) => p.toUpperCase()).includes(filter);

  return direct || multi;
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: PositionFilter;
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

export default function ResearchScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { allLeagues } = useLeague();
  const { setSelectedPlayer } = useSelectedPlayer();
  const {
    getWatchlistForLeague,
    loadWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
  } = useWatchlist();

  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    }

    void loadPlayers();
  }, [league?.playerPool, league?.posEligibilityThreshold, leagueId]);

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

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const watched = isInWatchlist(leagueId, item.id);

            return (
              <View
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#eee",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <TouchableOpacity
                  onPress={() => handleOpenPlayer(item)}
                  style={{ flex: 1 }}
                >
                  <Text style={{ fontWeight: "600", marginBottom: 2 }}>
                    {item.name}
                  </Text>
                  <Text>
                    {item.team} • {item.position} • ADP {item.adp}
                  </Text>
                  <Text>Value ${item.value}</Text>
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
    </SafeAreaView>
  );
}