import { useEffect, useMemo } from "react";
import {
  FlatList,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLeague } from "../contexts/LeagueContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { WatchlistPlayer } from "../api/watchlist";
import type { Player } from "../types/player";

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

export default function MyDraftScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { allLeagues } = useLeague();
  const { setSelectedPlayer } = useSelectedPlayer();
  const { getWatchlistForLeague, loadWatchlist, removeFromWatchlist } =
    useWatchlist();

  const league = useMemo(
    () => allLeagues.find((item) => item.id === leagueId),
    [allLeagues, leagueId],
  );

  const watchlist = getWatchlistForLeague(leagueId);

  useEffect(() => {
    void loadWatchlist(leagueId);
  }, [leagueId, loadWatchlist]);

  const totalRosterSpots = league
    ? Object.values(league.rosterSlots).reduce((sum, count) => sum + count, 0)
    : 0;

  function handleOpenPlayer(player: WatchlistPlayer) {
    setSelectedPlayer(watchlistToPlayer(player));
    navigation.navigate("CommandCenter", { leagueId });
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
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
        <Text style={{ marginBottom: 8 }}>
          League: {league?.name ?? "Unknown"}
        </Text>
        <Text style={{ marginBottom: 8 }}>
          Budget: ${league?.budget ?? 0}
        </Text>
        <Text style={{ marginBottom: 8 }}>Roster spots: {totalRosterSpots}</Text>
        <Text>Watchlist count: {watchlist.length}</Text>
      </View>

      <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
        Watchlist
      </Text>

      <FlatList
        data={watchlist}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
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
                {item.team} • {item.position}
              </Text>
              <Text>
                ADP {item.adp} • ${item.value}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void removeFromWatchlist(leagueId, item.id)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: "#fee2e2",
              }}
            >
              <Text style={{ color: "#991b1b" }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text>No watchlist players yet.</Text>}
      />
    </SafeAreaView>
  );
}