import { useEffect } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";

export default function LeaguesScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { allLeagues, loading, refreshLeagues } = useLeague();

  useEffect(() => {
    void refreshLeagues();
  }, [refreshLeagues]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 6 }}>
        Your Leagues
      </Text>

      <Text style={{ marginBottom: 16 }}>Welcome, {user?.displayName}</Text>

      <Button
        title="Create League"
        onPress={() => navigation.navigate("CreateLeague")}
      />

      <View style={{ height: 12 }} />

      <Button title="Logout" onPress={() => void logout()} />

      <View style={{ height: 20 }} />

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={allLeagues}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("LeagueTabs", {
                  leagueId: item.id,
                  leagueName: item.name,
                })
              }
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "600" }}>
                {item.name}
              </Text>
              <Text>{item.teams} teams</Text>
              <Text>${item.budget} budget</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text>No leagues found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}