import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createLeague } from "../api/leagues";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
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
    <AppChip
      label={label}
      selected={selected}
      onPress={onPress}
      style={{ marginRight: 10 }}
    />
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

  const parsed = useMemo(() => {
    return {
      teamCount: Number(teams),
      budgetValue: Number(budget),
      thresholdValue: Number(posEligibilityThreshold),
    };
  }, [teams, budget, posEligibilityThreshold]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!name.trim()) {
      errors.push("League name is required.");
    } else if (name.trim().length < 3) {
      errors.push("League name must be at least 3 characters.");
    }

    if (!Number.isInteger(parsed.teamCount) || parsed.teamCount < 2 || parsed.teamCount > 20) {
      errors.push("Team count must be an integer from 2 to 20.");
    }

    if (!Number.isInteger(parsed.budgetValue) || parsed.budgetValue < 50 || parsed.budgetValue > 1000) {
      errors.push("Budget must be an integer from 50 to 1000.");
    }

    if (
      !Number.isInteger(parsed.thresholdValue) ||
      parsed.thresholdValue < 1 ||
      parsed.thresholdValue > 50
    ) {
      errors.push("Eligibility threshold must be an integer from 1 to 50.");
    }

    return errors;
  }, [name, parsed]);

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (playerPool !== "Mixed" && parsed.teamCount > 15) {
      warnings.push("Single-league pools can get thin with more than 15 teams.");
    }

    if (parsed.budgetValue > 500) {
      warnings.push("This is a very high auction budget.");
    }

    if (parsed.thresholdValue <= 5) {
      warnings.push("A very low eligibility threshold creates many multi-position players.");
    }

    if (parsed.thresholdValue >= 35) {
      warnings.push("A very high eligibility threshold can make rosters less flexible.");
    }

    return warnings;
  }, [playerPool, parsed]);

  async function handleCreateLeague() {
    if (!token) return;

    if (validationErrors.length > 0) {
      Alert.alert("Fix the form first", validationErrors[0]);
      return;
    }

    setLoading(true);

    try {
      const league = await createLeague(
        {
          name: name.trim(),
          teams: parsed.teamCount,
          budget: parsed.budgetValue,
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
          posEligibilityThreshold: parsed.thresholdValue,
          teamNames: Array.from({ length: parsed.teamCount }, (_, i) => `Team ${i + 1}`),
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

        {validationErrors.length > 0 ? (
          <AppCard backgroundColor="#fef2f2" borderColor="#fecaca">
            <Text style={{ fontWeight: "700", color: "#991b1b", marginBottom: 8 }}>
              Fix these first
            </Text>
            {validationErrors.map((error, index) => (
              <Text key={index} style={{ color: "#991b1b", marginBottom: 4 }}>
                • {error}
              </Text>
            ))}
          </AppCard>
        ) : null}

        {validationWarnings.length > 0 ? (
          <AppCard backgroundColor="#fffbeb" borderColor="#fde68a">
            <Text style={{ fontWeight: "700", color: "#92400e", marginBottom: 8 }}>
              Heads up
            </Text>
            {validationWarnings.map((warning, index) => (
              <Text key={index} style={{ color: "#92400e", marginBottom: 4 }}>
                • {warning}
              </Text>
            ))}
          </AppCard>
        ) : null}

        <AppCard backgroundColor="#f9fafb">
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>League Summary</Text>
          <Text>Name: {name || "—"}</Text>
          <Text>Teams: {parsed.teamCount || "—"}</Text>
          <Text>Budget: ${parsed.budgetValue || "—"}</Text>
          <Text>Pool: {playerPool}</Text>
          <Text>Eligibility threshold: {parsed.thresholdValue || "—"}</Text>
          <Text>Scoring: 5x5 Roto</Text>
        </AppCard>

        <Button
          title={loading ? "Creating..." : "Create League"}
          onPress={handleCreateLeague}
          disabled={loading || validationErrors.length > 0}
        />

        <View style={{ height: 12 }} />

        <Button title="Back" onPress={() => navigation.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}