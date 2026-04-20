import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getPlayers } from "../api/players";
import { useLeague } from "../contexts/LeagueContext";
import type { Player } from "../types/player";

export default function ResearchScreen({ route }: any) {
  const { leagueId } = route.params;
  const { allLeagues } = useLeague();

  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const league = allLeagues.find((item) => item.id === leagueId);

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

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#eee",
              }}
            >
              <Text style={{ fontWeight: "600" }}>{item.name}</Text>
              <Text>
                {item.team} • {item.position} • ADP {item.adp}
              </Text>
              <Text>Value ${item.value}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text>No players found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}