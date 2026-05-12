import { useEffect, useMemo, useState } from "react";
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
import { updateLeague } from "../api/leagues";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, ErrorState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "LeagueSettings">;

type PlayerPool = "Mixed" | "AL" | "NL";
type Section = "setup" | "scoring" | "teams" | "roster";

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

const HITTING_STATS = [
  "R",
  "HR",
  "RBI",
  "SB",
  "AVG",
  "OBP",
  "SLG",
  "TB",
  "H",
  "BB",
  "K",
];

const PITCHING_STATS = [
  "W",
  "K",
  "ERA",
  "WHIP",
  "SV",
  "HLD",
  "IP",
  "CG",
];

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

function normalizeTeamNames(teams: number, names?: string[]): string[] {
  const result = Array.from({ length: Math.max(1, teams) }, (_, index) => {
    return names?.[index]?.trim() || `Team ${index + 1}`;
  });

  return result;
}

function normalizeRosterSlots(
  slots?: Record<string, number>,
): Record<string, number> {
  const result = { ...DEFAULT_ROSTER_SLOTS };

  if (slots) {
    for (const [key, value] of Object.entries(slots)) {
      result[key] = Math.max(0, Math.round(Number(value) || 0));
    }
  }

  return result;
}

function scoringHas(
  categories: { name: string; type: "batting" | "pitching" }[],
  name: string,
  type: "batting" | "pitching",
): boolean {
  return categories.some((cat) => cat.name === name && cat.type === type);
}

export default function LeagueSettingsScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues, refreshLeagues } = useLeague();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const [section, setSection] = useState<Section>("setup");
  const [leagueName, setLeagueName] = useState("");
  const [teamsRaw, setTeamsRaw] = useState("12");
  const [budgetRaw, setBudgetRaw] = useState("260");
  const [posEligibilityRaw, setPosEligibilityRaw] = useState("20");
  const [playerPool, setPlayerPool] = useState<PlayerPool>("Mixed");
  const [rosterSlots, setRosterSlots] = useState<Record<string, number>>(
    DEFAULT_ROSTER_SLOTS,
  );
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [hittingCats, setHittingCats] = useState<string[]>([]);
  const [pitchingCats, setPitchingCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!league) return;

    setLeagueName(league.name);
    setTeamsRaw(String(league.teams));
    setBudgetRaw(String(league.budget));
    setPosEligibilityRaw(String(league.posEligibilityThreshold ?? 20));
    setPlayerPool(league.playerPool ?? "Mixed");
    setRosterSlots(normalizeRosterSlots(league.rosterSlots));
    setTeamNames(normalizeTeamNames(league.teams, league.teamNames));

    setHittingCats(
      HITTING_STATS.filter((stat) =>
        scoringHas(league.scoringCategories ?? [], stat, "batting"),
      ),
    );

    setPitchingCats(
      PITCHING_STATS.filter((stat) =>
        scoringHas(league.scoringCategories ?? [], stat, "pitching"),
      ),
    );
  }, [league]);

  const teamCount = useMemo(() => {
    const parsed = Number.parseInt(teamsRaw, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(30, parsed));
  }, [teamsRaw]);

  useEffect(() => {
    setTeamNames((current) => normalizeTeamNames(teamCount, current));
  }, [teamCount]);

  const totalRosterSpots = useMemo(() => {
    return Object.values(rosterSlots).reduce((sum, value) => sum + value, 0);
  }, [rosterSlots]);

  function toggleHittingCat(stat: string) {
    setHittingCats((current) => {
      if (current.includes(stat)) {
        return current.filter((item) => item !== stat);
      }

      return [...current, stat];
    });
  }

  function togglePitchingCat(stat: string) {
    setPitchingCats((current) => {
      if (current.includes(stat)) {
        return current.filter((item) => item !== stat);
      }

      return [...current, stat];
    });
  }

  function updateTeamName(index: number, value: string) {
    setTeamNames((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  function updateRosterSlot(position: string, value: string) {
    const parsed = Number.parseInt(value, 10);
    const count = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

    setRosterSlots((current) => ({
      ...current,
      [position]: count,
    }));
  }

  async function handleSave() {
    if (!league || !token) return;

    const cleanName = leagueName.trim();
    const parsedTeams = Number.parseInt(teamsRaw, 10);
    const parsedBudget = Number.parseInt(budgetRaw, 10);
    const parsedPosEligibility = Number.parseInt(posEligibilityRaw, 10);

    if (!cleanName) {
      Alert.alert("Missing league name", "Please enter a league name.");
      return;
    }

    if (!Number.isFinite(parsedTeams) || parsedTeams < 1) {
      Alert.alert("Invalid teams", "Team count must be at least 1.");
      return;
    }

    if (!Number.isFinite(parsedBudget) || parsedBudget < 1) {
      Alert.alert("Invalid budget", "Budget must be at least $1.");
      return;
    }

    if (!Number.isFinite(parsedPosEligibility) || parsedPosEligibility < 1) {
      Alert.alert(
        "Invalid position eligibility",
        "Position eligibility must be at least 1 game.",
      );
      return;
    }

    if (hittingCats.length === 0 || pitchingCats.length === 0) {
      Alert.alert(
        "Missing scoring categories",
        "Please select at least one hitting and one pitching category.",
      );
      return;
    }

    const scoringCategories = [
      ...hittingCats.map((name) => ({
        name,
        type: "batting" as const,
      })),
      ...pitchingCats.map((name) => ({
        name,
        type: "pitching" as const,
      })),
    ];

    setSaving(true);
    setError("");

    try {
      await updateLeague(
        league.id,
        {
          name: cleanName,
          teams: parsedTeams,
          budget: parsedBudget,
          posEligibilityThreshold: parsedPosEligibility,
          rosterSlots,
          scoringCategories,
          playerPool,
          teamNames: normalizeTeamNames(parsedTeams, teamNames),
        },
        token,
      );

      await refreshLeagues();

      Alert.alert("Saved", "League settings were updated.", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save league settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 4 }}>
          League Settings
        </Text>

        <Text style={{ color: "#4b5563", marginBottom: 16 }}>
          Edit setup, scoring, team names, and roster slots.
        </Text>

        <View style={{ marginBottom: 12 }}>
          <Button
            title="Manage Keepers"
            onPress={() =>
              navigation.navigate("KeeperSettings", {
                leagueId: league.id,
                leagueName: league.name,
              })
            }
          />
        </View>

        {error ? <ErrorState label={error} /> : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
        >
          <AppChip
            label="Setup"
            selected={section === "setup"}
            onPress={() => setSection("setup")}
            style={{ marginRight: 8 }}
          />
          <AppChip
            label="Scoring"
            selected={section === "scoring"}
            onPress={() => setSection("scoring")}
            style={{ marginRight: 8 }}
          />
          <AppChip
            label="Teams"
            selected={section === "teams"}
            onPress={() => setSection("teams")}
            style={{ marginRight: 8 }}
          />
          <AppChip
            label="Roster"
            selected={section === "roster"}
            onPress={() => setSection("roster")}
            style={{ marginRight: 8 }}
          />
        </ScrollView>

        {section === "setup" ? (
          <AppCard>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
              League Setup
            </Text>

            <Text style={{ color: "#6b7280", marginBottom: 4 }}>
              League name
            </Text>
            <TextInput
              value={leagueName}
              onChangeText={setLeagueName}
              style={{
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            />

            <Text style={{ color: "#6b7280", marginBottom: 4 }}>Teams</Text>
            <TextInput
              value={teamsRaw}
              onChangeText={setTeamsRaw}
              keyboardType="number-pad"
              style={{
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            />

            <Text style={{ color: "#6b7280", marginBottom: 4 }}>
              Budget ($)
            </Text>
            <TextInput
              value={budgetRaw}
              onChangeText={setBudgetRaw}
              keyboardType="number-pad"
              style={{
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            />

            <Text style={{ color: "#6b7280", marginBottom: 4 }}>
              Position eligibility minimum games
            </Text>
            <TextInput
              value={posEligibilityRaw}
              onChangeText={setPosEligibilityRaw}
              keyboardType="number-pad"
              style={{
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
              }}
            />

            <Text style={{ color: "#6b7280", marginBottom: 8 }}>
              Player pool
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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

        {section === "scoring" ? (
          <AppCard>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
              Scoring Categories
            </Text>

            <Text style={{ fontWeight: "700", marginBottom: 8 }}>Hitting</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {HITTING_STATS.map((stat) => (
                <AppChip
                  key={stat}
                  label={stat}
                  selected={hittingCats.includes(stat)}
                  tone="info"
                  onPress={() => toggleHittingCat(stat)}
                />
              ))}
            </View>

            <View style={{ height: 18 }} />

            <Text style={{ fontWeight: "700", marginBottom: 8 }}>Pitching</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PITCHING_STATS.map((stat) => (
                <AppChip
                  key={stat}
                  label={stat}
                  selected={pitchingCats.includes(stat)}
                  tone="info"
                  onPress={() => togglePitchingCat(stat)}
                />
              ))}
            </View>
          </AppCard>
        ) : null}

        {section === "teams" ? (
          <AppCard>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
              Team Names
            </Text>

            {teamNames.slice(0, teamCount).map((teamName, index) => (
              <View key={index} style={{ marginBottom: 12 }}>
                <Text style={{ color: "#6b7280", marginBottom: 4 }}>
                  Team {index + 1}
                </Text>
                <TextInput
                  value={teamName}
                  onChangeText={(value) => updateTeamName(index, value)}
                  style={{
                    borderWidth: 1,
                    borderColor: "#d1d5db",
                    borderRadius: 10,
                    padding: 12,
                  }}
                />
              </View>
            ))}
          </AppCard>
        ) : null}

        {section === "roster" ? (
          <AppCard>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>
              Roster Slots
            </Text>

            <Text style={{ color: "#6b7280", marginBottom: 12 }}>
              Total roster spots: {totalRosterSpots}
            </Text>

            {ROSTER_SLOT_ORDER.map((position) => (
              <View
                key={position}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderTopColor: "#f1f5f9",
                  paddingVertical: 10,
                }}
              >
                <Text style={{ fontWeight: "700", width: 80 }}>{position}</Text>

                <TextInput
                  value={String(rosterSlots[position] ?? 0)}
                  onChangeText={(value) => updateRosterSlot(position, value)}
                  keyboardType="number-pad"
                  style={{
                    borderWidth: 1,
                    borderColor: "#d1d5db",
                    borderRadius: 10,
                    padding: 10,
                    width: 90,
                    textAlign: "center",
                  }}
                />
              </View>
            ))}

            <View style={{ height: 12 }} />

            <Button
              title="Reset roster defaults"
              onPress={() => setRosterSlots(DEFAULT_ROSTER_SLOTS)}
            />
          </AppCard>
        ) : null}

        <View style={{ height: 8 }} />

        <Button
          title={saving ? "Saving..." : "Save Settings"}
          disabled={saving}
          onPress={() => void handleSave()}
        />

        <View style={{ height: 12 }} />

        <Button title="Back" onPress={() => navigation.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}