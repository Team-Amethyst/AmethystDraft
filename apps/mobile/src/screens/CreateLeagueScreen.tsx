import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createLeague } from "../api/leagues";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";

const PLAYER_POOLS = ["Mixed", "AL", "NL"] as const;
type PlayerPool = (typeof PLAYER_POOLS)[number];

type Props = NativeStackScreenProps<RootStackParamList, "CreateLeague">;

function PoolChip({
  label,
  selected,
  onPress,
}: {
  label: PlayerPool;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? "#111827" : "#d1d5db",
        backgroundColor: selected ? "#111827" : "white",
        marginRight: 10,
      }}
    >
      <Text style={{ color: selected ? "white" : "#111827", fontWeight: "600" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function CreateLeagueScreen({ navigation }: Props) {
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  const [name, setName] = useState("Friendly League");
  const [teams, setTeams] = useState("12");
  const [budget, setBudget] = useState("260");
  const [playerPool, setPlayerPool] = useState<PlayerPool>("Mixed");
  const [posEligibilityThreshold, setPosEligibilityThreshold] = useState("20");
  const [loading, setLoading] = useState(false);

  const previewTeamCount = useMemo(() => {
    const value = Number(teams);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value;
  }, [teams]);

  async function handleCreateLeague() {
    if (!token) return;

    const teamCount = Number(teams);
    const budgetValue = Number(budget);
    const thresholdValue = Number(posEligibilityThreshold);

    if (!name.trim()) {
      Alert.alert("Missing league name", "Please enter a league name.");
      return;
    }

    if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 20) {
      Alert.alert("Invalid team count", "Please enter a team count from 2 to 20.");
      return;
    }

    if (!Number.isInteger(budgetValue) || budgetValue <= 0) {
      Alert.alert("Invalid budget", "Please enter a positive auction budget.");
      return;
    }

    if (!Number.isInteger(thresholdValue) || thresholdValue < 1) {
      Alert.alert(
        "Invalid eligibility threshold",
        "Please enter a positive eligibility threshold.",
      );
      return;
    }

    setLoading(true);

    try {
      const league = await createLeague(
        {
          name: name.trim(),
          teams: teamCount,
          budget: budgetValue,
          scoringFormat: "Roto",
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
          playerPool,
          posEligibilityThreshold: thresholdValue,
          teamNames: Array.from({ length: teamCount }, (_, i) => `Team ${i + 1}`),
        },
        token,
      );

      await refreshLeagues();

      navigation.replace("LeagueTabs", {
        leagueId: league.id,
        leagueName: league.name,
        screen: "Research",
        params: { leagueId: league.id },
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
        <Text style={{ fontSize: 26, fontWeight: "700", marginBottom: 8 }}>
          Create League
        </Text>

        <Text style={{ color: "#4b5563", marginBottom: 18 }}>
          Build your baseball auction room with a few core settings first.
        </Text>

        <Text style={{ marginBottom: 6, fontWeight: "600" }}>League Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="League name"
          style={{
            borderWidth: 1,
            borderColor: "#d1d5db",
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
          }}
        />

        <Text style={{ marginBottom: 6, fontWeight: "600" }}>Teams</Text>
        <TextInput
          value={teams}
          onChangeText={setTeams}
          keyboardType="numeric"
          placeholder="12"
          style={{
            borderWidth: 1,
            borderColor: "#d1d5db",
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
          }}
        />

        <Text style={{ marginBottom: 6, fontWeight: "600" }}>Budget</Text>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          placeholder="260"
          style={{
            borderWidth: 1,
            borderColor: "#d1d5db",
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
          }}
        />

        <Text style={{ marginBottom: 6, fontWeight: "600" }}>Player Pool</Text>
        <View style={{ flexDirection: "row", marginBottom: 14 }}>
          {PLAYER_POOLS.map((pool) => (
            <PoolChip
              key={pool}
              label={pool}
              selected={playerPool === pool}
              onPress={() => setPlayerPool(pool)}
            />
          ))}
        </View>

        <Text style={{ marginBottom: 6, fontWeight: "600" }}>
          Position Eligibility Threshold
        </Text>
        <TextInput
          value={posEligibilityThreshold}
          onChangeText={setPosEligibilityThreshold}
          keyboardType="numeric"
          placeholder="20"
          style={{
            borderWidth: 1,
            borderColor: "#d1d5db",
            marginBottom: 18,
            padding: 12,
            borderRadius: 10,
          }}
        />

        <View
          style={{
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 12,
            padding: 14,
            marginBottom: 18,
            backgroundColor: "#f9fafb",
          }}
        >
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>League Summary</Text>
          <Text>Name: {name || "—"}</Text>
          <Text>Teams: {previewTeamCount || "—"}</Text>
          <Text>Budget: ${budget || "—"}</Text>
          <Text>Pool: {playerPool}</Text>
          <Text>Eligibility threshold: {posEligibilityThreshold || "—"}</Text>
          <Text>Scoring: 5x5 Roto</Text>
        </View>

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