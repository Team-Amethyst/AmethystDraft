import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getPlayers } from "../api/players";
import { useLeague } from "../contexts/LeagueContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { Player } from "../types/player";

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
    const q = search.toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

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
          borderColor: "#ccc",
          marginBottom: 12,
          padding: 12,
          borderRadius: 8,
        }}
      />

      <Text style={{ marginBottom: 12 }}>
        Watchlist: {watchlist.length} players
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
                  <Text style={{ fontWeight: "600" }}>{item.name}</Text>
                  <Text>
                    {item.team} • {item.position} • ADP {item.adp}
                  </Text>
                  <Text>Value ${item.value}</Text>
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