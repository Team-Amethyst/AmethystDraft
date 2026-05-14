import { useEffect } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import { LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={allLeagues}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refreshLeagues()}
            tintColor={colors.purple2}
          />
        }
        ListHeaderComponent={
          <View>
            <Text
              style={{
                fontSize: 28,
                fontWeight: "900",
                color: colors.text,
                marginBottom: 4,
              }}
            >
              Your Leagues
            </Text>

            <Text style={{ color: colors.muted, marginBottom: 16 }}>
              Welcome, {user?.displayName}. Choose a draft room.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  title="Create League"
                  onPress={() => navigation.navigate("CreateLeague")}
                />
              </View>

              <View style={{ flex: 1 }}>
                <AppButton
                  title="Logout"
                  variant="secondary"
                  onPress={() => void logout()}
                />
              </View>
            </View>

            {loading && allLeagues.length === 0 ? (
              <LoadingState label="Loading leagues..." />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() =>
              navigation.navigate("LeagueTabs", {
                leagueId: item.id,
                leagueName: item.name,
                screen: "Research",
                params: { leagueId: item.id },
              })
            }
          >
            <AppCard>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
                {item.name}
              </Text>

              <Text style={{ color: colors.muted, marginTop: 6 }}>
                {item.teams} teams • ${item.budget} budget • {item.playerPool}
              </Text>

              <Text style={{ color: colors.muted, marginTop: 3 }}>
                {statusLabel(item.draftStatus)}
                {item.draftDate
                  ? ` • ${new Date(item.draftDate).toLocaleDateString()}`
                  : ""}
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <AppButton
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
                  <AppButton
                    title="Settings"
                    variant="secondary"
                    onPress={() =>
                      navigation.navigate("LeagueSettings", {
                        leagueId: item.id,
                        leagueName: item.name,
                      })
                    }
                  />
                </View>
              </View>
            </AppCard>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <AppCard>
              <Text style={{ color: colors.text, fontWeight: "800" }}>
                No leagues yet.
              </Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Create your first fantasy baseball draft room.
              </Text>
            </AppCard>
          ) : null
        }
      />
    </SafeAreaView>
  );
}