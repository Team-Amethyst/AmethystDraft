import { useEffect } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  Text,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Leagues">;

export default function LeaguesScreen({ navigation }: Props) {
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

      <Button title="Create League" onPress={() => navigation.navigate("CreateLeague")} />

      <SafeAreaView style={{ height: 12 }} />

      <Button title="Logout" onPress={() => void logout()} />

      <SafeAreaView style={{ height: 20 }} />

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
                  screen: "Research",
                  params: { leagueId: item.id },
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