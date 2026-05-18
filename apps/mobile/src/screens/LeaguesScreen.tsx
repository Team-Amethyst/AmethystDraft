import { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import {
  leagueSeasonYear,
  statusColor,
  statusLabel,
  uniqueSeasonYears,
} from "../domain/leagueForm";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { League } from "../types/league";

type Props = NativeStackScreenProps<RootStackParamList, "Leagues">;
type SeasonFilter = "all" | number;

function openLeague(
  navigation: Props["navigation"],
  league: League,
) {
  navigation.navigate("LeagueTabs", {
    leagueId: league.id,
    leagueName: league.name,
    screen: "Research",
    params: { leagueId: league.id },
  });
}

function statusBadgeStyle(status: League["draftStatus"] | string) {
  const color = statusColor(status);

  return {
    borderColor: color,
    backgroundColor: `${color}22`,
  };
}

function LeagueCard({
  league,
  navigation,
}: {
  league: League;
  navigation: Props["navigation"];
}) {
  const year = leagueSeasonYear(league);
  const status = statusLabel(league.draftStatus);
  const badge = statusBadgeStyle(league.draftStatus);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => openLeague(navigation, league)}
    >
      <AppCard backgroundColor="#100c18" borderColor="#31224f">
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: "900",
                  marginRight: 8,
                }}
              >
                {league.name}
              </Text>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#7c3aed",
                  backgroundColor: "#2c1647",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    color: "#ddd6fe",
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  {year}
                </Text>
              </View>
            </View>

            <Text
              style={{
                color: colors.purple2,
                marginTop: 8,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {league.teams} teams · ${league.budget} budget
            </Text>

            <Text style={{ color: colors.muted, marginTop: 4 }}>
              {league.playerPool || "Mixed"} MLB ·{" "}
              {Object.values(league.rosterSlots ?? {}).reduce(
                (sum, value) => sum + value,
                0,
              )}{" "}
              roster spots
            </Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <View
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
                ...badge,
              }}
            >
              <Text
                style={{
                  color: statusColor(league.draftStatus),
                  fontSize: 12,
                  fontWeight: "900",
                }}
              >
                {status}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate("LeagueSettings", {
                  leagueId: league.id,
                  leagueName: league.name,
                })
              }
              style={{
                marginTop: 10,
                width: 36,
                height: 36,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#4c3575",
                backgroundColor: "#150f22",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#c4b5fd",
                  fontSize: 18,
                  fontWeight: "900",
                }}
              >
                ⚙
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppCard>
    </TouchableOpacity>
  );
}

export default function LeaguesScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { allLeagues, loading, refreshLeagues } = useLeague();

  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>("all");

  useEffect(() => {
    void refreshLeagues();
  }, [refreshLeagues]);

  const seasonYears = useMemo(() => uniqueSeasonYears(allLeagues), [allLeagues]);

  const filteredLeagues = useMemo(() => {
    if (seasonFilter === "all") return allLeagues;
    return allLeagues.filter(
      (league) => leagueSeasonYear(league) === seasonFilter,
    );
  }, [allLeagues, seasonFilter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 36 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refreshLeagues()}
            tintColor={colors.purple2}
          />
        }
      >
        <View style={{ marginBottom: 26 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 32,
              fontWeight: "900",
              marginBottom: 8,
            }}
          >
            My Leagues
          </Text>

          <Text style={{ color: colors.purple2, fontSize: 16, lineHeight: 22 }}>
            Join or create a league to start drafting your championship team
          </Text>
        </View>

        <View style={{ marginBottom: 22 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <AppButton
                title="＋ Create League"
                onPress={() => navigation.navigate("CreateLeague")}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate("CreateLeague", {
                  demo: true,
                  demoCheckpointKey: "pre_draft",
                })
              }
              style={{ paddingHorizontal: 6, paddingVertical: 8 }}
            >
              <Text
                style={{
                  color: "#c084fc",
                  textDecorationLine: "underline",
                  fontWeight: "800",
                }}
              >
                Demo league...
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {allLeagues.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                color: "#a78bfa",
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.2,
                marginBottom: 8,
              }}
            >
              SEASON
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <AppChip
                label="All seasons"
                selected={seasonFilter === "all"}
                onPress={() => setSeasonFilter("all")}
                style={{ marginRight: 8 }}
              />

              {seasonYears.map((year) => (
                <AppChip
                  key={year}
                  label={String(year)}
                  selected={seasonFilter === year}
                  onPress={() => setSeasonFilter(year)}
                  style={{ marginRight: 8 }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {loading && allLeagues.length === 0 ? (
          <LoadingState label="Loading leagues..." />
        ) : null}

        {!loading && filteredLeagues.length === 0 ? (
          <EmptyState
            label={
              allLeagues.length === 0
                ? "No leagues yet. Create one or load a demo league."
                : "No leagues match this season filter."
            }
          />
        ) : null}

        {filteredLeagues.map((league) => (
          <LeagueCard key={league.id} league={league} navigation={navigation} />
        ))}

        <View style={{ marginTop: 8 }}>
          <AppButton
            title={`Sign out${user?.displayName ? ` (${user.displayName})` : ""}`}
            variant="secondary"
            onPress={() => void logout()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}