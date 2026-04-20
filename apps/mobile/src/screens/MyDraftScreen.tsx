import { useMemo } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { useLeague } from "../contexts/LeagueContext";

export default function MyDraftScreen({ route }: any) {
  const { leagueId } = route.params;
  const { allLeagues } = useLeague();

  const league = useMemo(
    () => allLeagues.find((item) => item.id === leagueId),
    [allLeagues, leagueId],
  );

  const totalRosterSpots = league
    ? Object.values(league.rosterSlots).reduce((sum, count) => sum + count, 0)
    : 0;

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
        }}
      >
        <Text style={{ marginBottom: 8 }}>
          League: {league?.name ?? "Unknown"}
        </Text>
        <Text style={{ marginBottom: 8 }}>
          Budget: ${league?.budget ?? 0}
        </Text>
        <Text>Roster spots: {totalRosterSpots}</Text>
      </View>
    </SafeAreaView>
  );
}