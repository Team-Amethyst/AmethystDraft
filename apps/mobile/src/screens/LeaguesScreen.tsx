import { useEffect } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Leagues">;

function statusLabel(status: string): string {
  if (status === "pre-draft") return "Pre-Draft";
  if (status === "in-progress") return "In Progress";
  if (status === "completed") return "Completed";
  return status;
}

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
            <View
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                marginBottom: 12,
                backgroundColor: "white",
              }}
            >
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("LeagueTabs", {
                    leagueId: item.id,
                    leagueName: item.name,
                    screen: "Research",
                    params: { leagueId: item.id },
                  })
                }
              >
                <Text style={{ fontSize: 18, fontWeight: "700" }}>
                  {item.name}
                </Text>

                <Text style={{ color: "#4b5563", marginTop: 4 }}>
                  {item.teams} teams • ${item.budget} budget
                </Text>

                <Text style={{ color: "#4b5563", marginTop: 2 }}>
                  {statusLabel(item.draftStatus)}
                  {item.draftDate
                    ? ` • ${new Date(item.draftDate).toLocaleDateString()}`
                    : ""}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 12 }} />

              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Open"
                    onPress={() =>
                      navigation.navigate("LeagueTabs", {
                        leagueId: item.id,
                        leagueName: item.name,
                        screen: "Research",
                        params: { leagueId: item.id },
                      })
                    }
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Button
                    title="Settings"
                    onPress={() =>
                      navigation.navigate("LeagueSettings", {
                        leagueId: item.id,
                        leagueName: item.name,
                      })
                    }
                  />
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text>No leagues found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}