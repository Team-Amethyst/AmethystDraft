import { useState } from "react";
import {
  Alert,
  Button,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { createLeague } from "../api/leagues";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";

export default function CreateLeagueScreen({ navigation }: any) {
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  const [name, setName] = useState("Friendly League");
  const [teams, setTeams] = useState("12");
  const [budget, setBudget] = useState("260");
  const [loading, setLoading] = useState(false);

  async function handleCreateLeague() {
    if (!token) return;

    setLoading(true);

    try {
      const teamCount = Number(teams);
      const league = await createLeague(
        {
          name,
          teams: teamCount,
          budget: Number(budget),
          rosterSlots: {
            C: 1,
            "1B": 1,
            "2B": 1,
            SS: 1,
            "3B": 1,
            MI: 1,
            CI: 1,
            OF: 3,
            UTIL: 1,
            SP: 5,
            RP: 2,
            BN: 3,
          },
          scoringCategories: [
            { name: "HR", type: "batting" },
            { name: "RBI", type: "batting" },
            { name: "R", type: "batting" },
            { name: "SB", type: "batting" },
            { name: "AVG", type: "batting" },
            { name: "W", type: "pitching" },
            { name: "K", type: "pitching" },
            { name: "ERA", type: "pitching" },
            { name: "WHIP", type: "pitching" },
            { name: "SV", type: "pitching" },
          ],
          playerPool: "Mixed",
          posEligibilityThreshold: 20,
          teamNames: Array.from(
            { length: teamCount },
            (_, i) => `Team ${i + 1}`,
          ),
        },
        token,
      );

      await refreshLeagues();

      navigation.replace("LeagueTabs", {
        leagueId: league.id,
        leagueName: league.name,
      });
    } catch (err) {
      Alert.alert(
        "Failed to create league",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 16 }}>
          Create League
        </Text>

        <Text style={{ marginBottom: 6 }}>League Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            marginBottom: 12,
            padding: 12,
            borderRadius: 8,
          }}
        />

        <Text style={{ marginBottom: 6 }}>Teams</Text>
        <TextInput
          value={teams}
          onChangeText={setTeams}
          keyboardType="numeric"
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            marginBottom: 12,
            padding: 12,
            borderRadius: 8,
          }}
        />

        <Text style={{ marginBottom: 6 }}>Budget</Text>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
          }}
        />

        <Button
          title={loading ? "Creating..." : "Create League"}
          onPress={handleCreateLeague}
          disabled={loading}
        />

        <View style={{ height: 12 }} />

        <Button title="Back" onPress={() => navigation.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}