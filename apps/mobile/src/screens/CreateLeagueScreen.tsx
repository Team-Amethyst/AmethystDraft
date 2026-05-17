import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createLeague } from "../api/leagues";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import AppTextInput from "../components/ui/AppTextInput";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "CreateLeague">;

type PlayerPool = "Mixed" | "AL" | "NL";
type Step = 1 | 2 | 3;

const DEFAULT_ROSTER_SLOTS: Record<string, number> = {
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
};

const ROSTER_SLOT_ORDER = [
  "C",
  "1B",
  "2B",
  "SS",
  "3B",
  "MI",
  "CI",
  "OF",
  "UTIL",
  "SP",
  "RP",
  "BN",
];

const HITTING_STATS = ["R", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "TB"];
const PITCHING_STATS = ["W", "K", "ERA", "WHIP", "SV", "HLD", "IP", "CG"];

function parseIntSafe(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toggleValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return [...values, value];
}

function buildTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Team ${index + 1}`);
}

export default function CreateLeagueScreen({ navigation }: Props) {
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("Friendly League");
  const [teams, setTeams] = useState("12");
  const [budget, setBudget] = useState("260");
  const [playerPool, setPlayerPool] = useState<PlayerPool>("Mixed");
  const [posEligibilityThreshold, setPosEligibilityThreshold] = useState("20");
  const [hittingStats, setHittingStats] = useState(["R", "HR", "RBI", "SB", "AVG"]);
  const [pitchingStats, setPitchingStats] = useState(["W", "K", "ERA", "WHIP", "SV"]);
  const [rosterSlots, setRosterSlots] = useState<Record<string, number>>(
    DEFAULT_ROSTER_SLOTS,
  );
  const [loading, setLoading] = useState(false);

  const teamCount = Math.max(2, Math.min(30, parseIntSafe(teams, 12)));
  const budgetValue = Math.max(1, parseIntSafe(budget, 260));
  const thresholdValue = Math.max(1, parseIntSafe(posEligibilityThreshold, 20));

  const totalRosterSpots = useMemo(() => {
    return Object.values(rosterSlots).reduce((sum, value) => sum + value, 0);
  }, [rosterSlots]);

  function updateRosterSlot(position: string, value: string) {
    const count = Math.max(0, parseIntSafe(value, 0));

    setRosterSlots((current) => ({
      ...current,
      [position]: count,
    }));
  }

  function validate(): string | null {
    if (!name.trim()) return "League name is required.";
    if (hittingStats.length === 0) return "Select at least one hitting category.";
    if (pitchingStats.length === 0) return "Select at least one pitching category.";
    if (totalRosterSpots === 0) return "Roster must have at least one slot.";
    return null;
  }

  async function handleCreateLeague() {
    if (!token) {
      Alert.alert("Not logged in", "Please log in again before creating a league.");
      return;
    }

    const error = validate();

    if (error) {
      Alert.alert("Fix the form first", error);
      return;
    }

    setLoading(true);

    try {
      const league = await createLeague(
        {
          name: name.trim(),
          teams: teamCount,
          budget: budgetValue,
          scoringFormat: "5x5",
          rosterSlots,
          scoringCategories: [
            ...hittingStats.map((stat) => ({
              name: stat,
              type: "batting" as const,
            })),
            ...pitchingStats.map((stat) => ({
              name: stat,
              type: "pitching" as const,
            })),
          ],
          playerPool,
          posEligibilityThreshold: thresholdValue,
          teamNames: buildTeamNames(teamCount),
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
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (step < 3) {
      setStep((current) => (current + 1) as Step);
      return;
    }

    void handleCreateLeague();
  }

  function handleBack() {
    if (step === 1) {
      navigation.goBack();
      return;
    }

    setStep((current) => (current - 1) as Step);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: colors.text }}>
          Create League
        </Text>

        <Text style={{ color: colors.muted, marginTop: 4, marginBottom: 16 }}>
          Build your auction draft room in a few steps.
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {[1, 2, 3].map((item) => (
            <View
              key={item}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 999,
                backgroundColor: item <= step ? colors.purple : colors.surface2,
              }}
            />
          ))}
        </View>

        {step === 1 ? (
          <AppCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
              Step 1: League Setup
            </Text>

            <View style={{ height: 14 }} />

            <AppTextInput
              label="League name"
              value={name}
              onChangeText={setName}
            />

            <AppTextInput
              label="Teams"
              value={teams}
              onChangeText={setTeams}
              keyboardType="number-pad"
            />

            <AppTextInput
              label="Budget"
              value={budget}
              onChangeText={setBudget}
              keyboardType="number-pad"
            />

            <AppTextInput
              label="Position eligibility minimum games"
              value={posEligibilityThreshold}
              onChangeText={setPosEligibilityThreshold}
              keyboardType="number-pad"
            />

            <Text style={{ color: colors.muted, fontWeight: "700", marginBottom: 8 }}>
              Player pool
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["Mixed", "AL", "NL"] as PlayerPool[]).map((pool) => (
                <AppChip
                  key={pool}
                  label={pool}
                  selected={playerPool === pool}
                  tone="info"
                  onPress={() => setPlayerPool(pool)}
                />
              ))}
            </View>
          </AppCard>
        ) : null}

        {step === 2 ? (
          <AppCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
              Step 2: Scoring
            </Text>

            <Text style={{ color: colors.text, fontWeight: "800", marginTop: 14, marginBottom: 8 }}>
              Hitting
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {HITTING_STATS.map((stat) => (
                <AppChip
                  key={stat}
                  label={stat}
                  selected={hittingStats.includes(stat)}
                  tone="info"
                  onPress={() =>
                    setHittingStats((current) => toggleValue(current, stat))
                  }
                />
              ))}
            </View>

            <Text style={{ color: colors.text, fontWeight: "800", marginTop: 18, marginBottom: 8 }}>
              Pitching
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PITCHING_STATS.map((stat) => (
                <AppChip
                  key={stat}
                  label={stat}
                  selected={pitchingStats.includes(stat)}
                  tone="info"
                  onPress={() =>
                    setPitchingStats((current) => toggleValue(current, stat))
                  }
                />
              ))}
            </View>
          </AppCard>
        ) : null}

        {step === 3 ? (
          <AppCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
              Step 3: Roster Slots
            </Text>

            <Text style={{ color: colors.muted, marginTop: 4, marginBottom: 12 }}>
              Total roster spots: {totalRosterSpots}
            </Text>

            {ROSTER_SLOT_ORDER.map((position) => (
              <View
                key={position}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "800", width: 80 }}>
                  {position}
                </Text>

                <AppTextInput
                  value={String(rosterSlots[position] ?? 0)}
                  onChangeText={(value) => updateRosterSlot(position, value)}
                  keyboardType="number-pad"
                  containerStyle={{ marginBottom: 0, width: 90 }}
                  style={{ textAlign: "center" }}
                />
              </View>
            ))}

            <View style={{ marginTop: 12 }}>
              <AppButton
                title="Reset roster defaults"
                variant="secondary"
                onPress={() => setRosterSlots(DEFAULT_ROSTER_SLOTS)}
              />
            </View>
          </AppCard>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AppButton
              title={step === 1 ? "Cancel" : "Back"}
              variant="secondary"
              onPress={handleBack}
            />
          </View>

          <View style={{ flex: 1 }}>
            <AppButton
              title={step === 3 ? "Create" : "Next"}
              loading={loading}
              disabled={loading}
              onPress={handleNext}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}