import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { deleteLeague, updateLeague, type LeaguePlayerPool } from "../api/leagues";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import AppTextInput from "../components/ui/AppTextInput";
import { EmptyState, ErrorState } from "../components/ui/ScreenState";
import LeagueKeeperEditor from "../components/leagues/LeagueKeeperEditor";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { League } from "../types/league";
import {
  DEFAULT_BUDGET,
  DEFAULT_HITTING_STATS,
  DEFAULT_LEAGUE_NAME,
  DEFAULT_PITCHING_STATS,
  DEFAULT_POS_ELIGIBILITY_THRESHOLD,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_TEAM_COUNT,
  HITTING_STATS,
  LEAGUE_TEAMS_MAX,
  LEAGUE_TEAMS_MIN,
  PITCHING_STATS,
  PLAYER_POOL_OPTIONS,
  ROSTER_SLOT_DEFINITIONS,
  buildScoringCategories,
  clampNumber,
  normalizeRosterSlots,
  normalizeTeamNames,
  parseInteger,
  rosterSpotsTotal,
  scoringKeysByType,
  validateBaseLeagueForm,
  type LeagueSettingsSection,
} from "../domain/leagueForm";

type Props = NativeStackScreenProps<RootStackParamList, "LeagueSettings">;

const SECTION_META: { key: LeagueSettingsSection; title: string; subtitle: string }[] = [
  {
    key: "setup",
    title: "League Setup",
    subtitle: "Name, teams, budget, roster",
  },
  {
    key: "scoring",
    title: "Scoring",
    subtitle: "Player pool & stat categories",
  },
  {
    key: "teams",
    title: "Team Names",
    subtitle: "Customize each team's name",
  },
  {
    key: "keepers",
    title: "Keepers",
    subtitle: "Keeper slots, costs & contracts",
  },
];

function toggleValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return [...values, value];
}

function fieldLabel(label: string) {
  return (
    <Text
      style={{
        color: colors.purple2,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1,
        marginBottom: 7,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );
}

function SettingsNav({
  selected,
  onSelect,
}: {
  selected: LeagueSettingsSection;
  onSelect: (section: LeagueSettingsSection) => void;
}) {
  return (
    <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
      {SECTION_META.map((section) => (
        <TouchableOpacity
          key={section.key}
          activeOpacity={0.85}
          onPress={() => onSelect(section.key)}
          style={{
            borderWidth: 1,
            borderColor: selected === section.key ? colors.purple2 : colors.border,
            backgroundColor: selected === section.key ? "#3b1d56" : colors.surface,
            borderRadius: 12,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>
            {section.title}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 3 }}>{section.subtitle}</Text>
        </TouchableOpacity>
      ))}
    </AppCard>
  );
}

function RosterSlotEditor({
  rosterSlots,
  onChange,
}: {
  rosterSlots: Record<string, number>;
  onChange: (position: string, value: number) => void;
}) {
  return (
    <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ color: colors.purple2, fontWeight: "900", letterSpacing: 1 }}>
          ROSTER SLOTS (MLB STANDARD)
        </Text>
        <Text style={{ color: colors.muted, fontWeight: "800" }}>
          Total: {rosterSpotsTotal(rosterSlots)}
        </Text>
      </View>

      {ROSTER_SLOT_DEFINITIONS.map((row, index) => (
        <View
          key={row.position}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: colors.border,
            paddingVertical: 9,
          }}
        >
          <View
            style={{
              width: 48,
              borderWidth: 1,
              borderColor: "#5b3a89",
              backgroundColor: "#271a3d",
              borderRadius: 8,
              paddingVertical: 5,
              alignItems: "center",
              marginRight: 10,
            }}
          >
            <Text style={{ color: "#ddd6fe", fontWeight: "900" }}>{row.position}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>{row.label}</Text>
          </View>
          <AppTextInput
            value={String(rosterSlots[row.position] ?? 0)}
            onChangeText={(value) => onChange(row.position, Math.max(0, parseInteger(value, 0)))}
            keyboardType="number-pad"
            containerStyle={{ marginBottom: 0, width: 76 }}
            style={{ textAlign: "center", paddingVertical: 8 }}
          />
        </View>
      ))}

      <View style={{ marginTop: 12 }}>
        <AppButton
          title="Reset roster defaults"
          variant="secondary"
          onPress={() => {
            for (const row of ROSTER_SLOT_DEFINITIONS) {
              onChange(row.position, row.count);
            }
          }}
        />
      </View>
    </AppCard>
  );
}

function readLeagueValues(league: League | null) {
  const keys = scoringKeysByType(league?.scoringCategories);

  return {
    name: league?.name ?? DEFAULT_LEAGUE_NAME,
    teams: String(league?.teams ?? DEFAULT_TEAM_COUNT),
    budget: String(league?.budget ?? DEFAULT_BUDGET),
    posEligibility: String(league?.posEligibilityThreshold ?? DEFAULT_POS_ELIGIBILITY_THRESHOLD),
    seasonYear: String(league?.seasonYear ?? new Date().getFullYear()),
    playerPool: league?.playerPool ?? "Mixed" as LeaguePlayerPool,
    rosterSlots: normalizeRosterSlots(league?.rosterSlots ?? DEFAULT_ROSTER_SLOTS),
    teamNames: normalizeTeamNames(league?.teams ?? DEFAULT_TEAM_COUNT, league?.teamNames),
    hittingStats: keys.hitting.length > 0 ? keys.hitting : DEFAULT_HITTING_STATS,
    pitchingStats: keys.pitching.length > 0 ? keys.pitching : DEFAULT_PITCHING_STATS,
  };
}

export default function LeagueSettingsScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
  const { token, user } = useAuth();
  const { allLeagues, refreshLeagues } = useLeague();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const initial = useMemo(() => readLeagueValues(league), [league]);

  const [section, setSection] = useState<LeagueSettingsSection>("setup");
  const [leagueName, setLeagueName] = useState(initial.name);
  const [teamsRaw, setTeamsRaw] = useState(initial.teams);
  const [budgetRaw, setBudgetRaw] = useState(initial.budget);
  const [posEligibilityRaw, setPosEligibilityRaw] = useState(initial.posEligibility);
  const [seasonYearRaw, setSeasonYearRaw] = useState(initial.seasonYear);
  const [playerPool, setPlayerPool] = useState<LeaguePlayerPool>(initial.playerPool);
  const [rosterSlots, setRosterSlots] = useState<Record<string, number>>(initial.rosterSlots);
  const [teamNames, setTeamNames] = useState<string[]>(initial.teamNames);
  const [hittingStats, setHittingStats] = useState<string[]>(initial.hittingStats);
  const [pitchingStats, setPitchingStats] = useState<string[]>(initial.pitchingStats);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = readLeagueValues(league);
    setLeagueName(next.name);
    setTeamsRaw(next.teams);
    setBudgetRaw(next.budget);
    setPosEligibilityRaw(next.posEligibility);
    setSeasonYearRaw(next.seasonYear);
    setPlayerPool(next.playerPool);
    setRosterSlots(next.rosterSlots);
    setTeamNames(next.teamNames);
    setHittingStats(next.hittingStats);
    setPitchingStats(next.pitchingStats);
  }, [league]);

  const teamCount = clampNumber(parseInteger(teamsRaw, DEFAULT_TEAM_COUNT), 1, LEAGUE_TEAMS_MAX);
  const budgetValue = Math.max(1, parseInteger(budgetRaw, DEFAULT_BUDGET));
  const posEligibilityValue = Math.max(1, parseInteger(posEligibilityRaw, DEFAULT_POS_ELIGIBILITY_THRESHOLD));
  const seasonYear = Math.max(2000, parseInteger(seasonYearRaw, new Date().getFullYear()));

  useEffect(() => {
    setTeamNames((current) => normalizeTeamNames(teamCount, current));
  }, [teamCount]);

  const keeperLeagueShape = useMemo(
    () => ({
      id: league?.id,
      teams: teamCount,
      teamNames,
      rosterSlots,
      posEligibilityThreshold: posEligibilityValue,
      playerPool,
    }),
    [league?.id, playerPool, posEligibilityValue, rosterSlots, teamCount, teamNames],
  );

  function updateRosterSlot(position: string, value: number) {
    setRosterSlots((current) => ({
      ...current,
      [position]: value,
    }));
  }

  function updateTeamName(index: number, value: string) {
    setTeamNames((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  async function handleSave() {
    if (!league || !token) return;

    const formError = validateBaseLeagueForm({
      name: leagueName,
      teams: teamCount,
      budget: budgetValue,
      rosterSlots,
      hittingStats,
      pitchingStats,
      posEligibilityThreshold: posEligibilityValue,
    });

    if (formError) {
      Alert.alert("Fix the form first", formError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateLeague(
        league.id,
        {
          name: leagueName.trim(),
          teams: teamCount,
          budget: budgetValue,
          rosterSlots,
          scoringFormat: league.scoringFormat ?? "roto",
          scoringCategories: buildScoringCategories(hittingStats, pitchingStats),
          playerPool,
          posEligibilityThreshold: posEligibilityValue,
          teamNames: normalizeTeamNames(teamCount, teamNames),
          seasonYear,
        },
        token,
      );

      await refreshLeagues();
      Alert.alert("Saved", "League settings were updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteLeague() {
    if (!league || !token) return;

    Alert.alert(
      "Delete league?",
      `Permanently remove ${league.name}, all roster entries, watchlists, and notes? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void handleDeleteLeague(),
        },
      ],
    );
  }

  async function handleDeleteLeague() {
    if (!league || !token) return;

    setDeleting(true);
    setError("");

    try {
      await deleteLeague(league.id, token);
      await refreshLeagues();
      navigation.replace("Leagues");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete league.");
    } finally {
      setDeleting(false);
    }
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 14 }}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>

        <Text style={{ color: colors.text, fontSize: 30, fontWeight: "900", marginBottom: 6 }}>
          {league.name} Settings
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 16 }}>
          Update league setup, scoring, team names, and keeper rosters. Keepers save directly on the Keepers tab.
        </Text>

        {error ? <ErrorState label={error} /> : null}

        <SettingsNav selected={section} onSelect={setSection} />

        {section === "setup" ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 }}>
              League Setup
            </Text>

            <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
              <AppTextInput label="League Name" value={leagueName} onChangeText={setLeagueName} />
              <AppTextInput label="Teams" value={teamsRaw} onChangeText={setTeamsRaw} keyboardType="number-pad" />
              <Text style={{ color: colors.muted, marginTop: -6, marginBottom: 10 }}>
                {LEAGUE_TEAMS_MIN}–{LEAGUE_TEAMS_MAX} teams
              </Text>
              <AppTextInput label="Budget ($)" value={budgetRaw} onChangeText={setBudgetRaw} keyboardType="number-pad" />
              <AppTextInput label="Position Eligibility (min. games)" value={posEligibilityRaw} onChangeText={setPosEligibilityRaw} keyboardType="number-pad" />
              <AppTextInput label="Season Year" value={seasonYearRaw} onChangeText={setSeasonYearRaw} keyboardType="number-pad" />

              {fieldLabel("Player Pool")}
              <View style={{ gap: 10 }}>
                {PLAYER_POOL_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.apiValue}
                    activeOpacity={0.85}
                    onPress={() => setPlayerPool(option.apiValue)}
                    style={{
                      borderWidth: 1,
                      borderColor: playerPool === option.apiValue ? colors.purple2 : colors.border,
                      backgroundColor: playerPool === option.apiValue ? "#3b1d56" : colors.surface,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900" }}>{option.label}</Text>
                    <Text style={{ color: colors.muted, marginTop: 3 }}>{option.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </AppCard>

            <RosterSlotEditor rosterSlots={rosterSlots} onChange={updateRosterSlot} />

            <AppCard backgroundColor="#26101f" borderColor="#7f1d1d">
              <Text style={{ color: "#fecaca", fontSize: 18, fontWeight: "900", marginBottom: 6 }}>
                DELETE LEAGUE
              </Text>
              <Text style={{ color: "#fecaca", marginBottom: 12 }}>
                Permanently remove this league, all roster entries, watchlists, and notes for every member. This cannot be undone.
              </Text>
              <AppButton
                title={deleting ? "Deleting..." : "Delete league..."}
                variant="danger"
                loading={deleting}
                disabled={deleting}
                onPress={confirmDeleteLeague}
              />
            </AppCard>
          </AppCard>
        ) : null}

        {section === "scoring" ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 }}>
              Scoring
            </Text>
            <Text style={{ color: colors.muted, marginBottom: 16 }}>
              Select the individual stats for your Rotisserie league scoring.
            </Text>

            <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
              {fieldLabel("Hitting Stats")}
              {HITTING_STATS.map((stat) => (
                <AppChip
                  key={stat.key}
                  label={stat.label}
                  selected={hittingStats.includes(stat.key)}
                  onPress={() => setHittingStats((current) => toggleValue(current, stat.key))}
                  fullWidth
                  style={{ marginBottom: 8, alignItems: "flex-start" }}
                />
              ))}
            </AppCard>

            <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
              {fieldLabel("Pitching Stats")}
              {PITCHING_STATS.map((stat) => (
                <AppChip
                  key={stat.key}
                  label={stat.label}
                  selected={pitchingStats.includes(stat.key)}
                  onPress={() => setPitchingStats((current) => toggleValue(current, stat.key))}
                  fullWidth
                  style={{ marginBottom: 8, alignItems: "flex-start" }}
                />
              ))}
            </AppCard>
          </AppCard>
        ) : null}

        {section === "teams" ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 }}>
              Team Names
            </Text>
            <Text style={{ color: colors.muted, marginBottom: 16 }}>
              Name all {teamCount} teams in your league.
            </Text>

            <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
              {teamNames.slice(0, teamCount).map((teamName, index) => (
                <AppTextInput
                  key={index}
                  label={`Team ${index + 1}`}
                  value={teamName}
                  onChangeText={(value) => updateTeamName(index, value)}
                />
              ))}
            </AppCard>
          </AppCard>
        ) : null}

        {section === "keepers" ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 }}>
              Keepers
            </Text>
            <Text style={{ color: colors.muted, marginBottom: 16 }}>
              Add, remove, and edit keeper slots, costs, and contracts.
            </Text>

            <LeagueKeeperEditor
              mode="persisted"
              league={keeperLeagueShape}
              leagueId={league.id}
              token={token}
              userId={user?.id}
            />
          </AppCard>
        ) : null}

        {section !== "keepers" ? (
          <View style={{ marginTop: 4 }}>
            <AppButton
              title={saving ? "Saving..." : "Save Settings"}
              loading={saving}
              disabled={saving}
              onPress={() => void handleSave()}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
