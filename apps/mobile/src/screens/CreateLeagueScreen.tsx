import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  createLeague,
  createLeagueFromEngineCheckpoint,
  type EngineCheckpointKey,
  type LeaguePlayerPool,
} from "../api/leagues";
import { addRosterEntry } from "../api/roster";
import { fetchEngineCheckpointJson } from "../api/checkpoints";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import AppTextInput from "../components/ui/AppTextInput";
import { ErrorState } from "../components/ui/ScreenState";
import LeagueKeeperEditor, {
  type DraftKeeperEntry,
} from "../components/leagues/LeagueKeeperEditor";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import {
  CHECKPOINT_OPTIONS,
  DEFAULT_BUDGET,
  DEFAULT_HITTING_STATS,
  DEFAULT_LEAGUE_NAME,
  DEFAULT_PITCHING_STATS,
  DEFAULT_POS_ELIGIBILITY_THRESHOLD,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SEASON_YEAR,
  DEFAULT_TEAM_COUNT,
  HITTING_STATS,
  LEAGUE_TEAMS_MAX,
  LEAGUE_TEAMS_MIN,
  PITCHING_STATS,
  PLAYER_POOL_OPTIONS,
  ROSTER_SLOT_DEFINITIONS,
  buildScoringCategories,
  checkpointLabel,
  clampNumber,
  normalizeRosterSlots,
  normalizeTeamNames,
  parseInteger,
  rosterSpotsTotal,
  validateBaseLeagueForm,
  type LeagueWizardStep,
} from "../domain/leagueForm";

type Props = NativeStackScreenProps<RootStackParamList, "CreateLeague">;

type CheckpointPreset = {
  name?: string;
  teams?: number;
  budget?: number;
  posEligibilityThreshold?: number;
  playerPool?: LeaguePlayerPool;
  rosterSlots?: Record<string, number>;
  teamNames?: string[];
  scoringCategories?: { name: string; type: "batting" | "pitching" }[];
  seasonYear?: number;
};

const STEP_LABELS: Record<LeagueWizardStep, string> = {
  1: "League Setup",
  2: "Scoring",
  3: "Team Names",
  4: "Keepers",
};

function demoLeagueName(key: EngineCheckpointKey): string {
  const label = checkpointLabel(key).replace(/-/g, " ").toLowerCase();
  return "[Demo] " + label;
}

function demoTeamNames(count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    if (index < 26) return "Team " + String.fromCharCode(65 + index);
    return "Team " + String(index + 1);
  });
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

function toggleValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return [...values, value];
}

function extractCheckpointPreset(raw: unknown): CheckpointPreset | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const candidates = [
    record.league,
    record.settings,
    record.league_settings,
    record.config,
    record.metadata,
    record,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    const source = candidate as Record<string, unknown>;
    const teams = Number(source.teams ?? source.teamCount ?? source.numTeams);
    const budget = Number(source.budget ?? source.auctionBudget);
    const threshold = Number(
      source.posEligibilityThreshold ?? source.positionEligibility,
    );
    const seasonYear = Number(source.seasonYear ?? source.year);
    const playerPool =
      source.playerPool === "AL" ||
      source.playerPool === "NL" ||
      source.playerPool === "Mixed"
        ? source.playerPool
        : undefined;

    const teamNames = Array.isArray(source.teamNames)
      ? source.teamNames.filter((item): item is string => typeof item === "string")
      : undefined;

    const rosterSlots =
      source.rosterSlots && typeof source.rosterSlots === "object"
        ? normalizeRosterSlots(source.rosterSlots as Record<string, number>)
        : undefined;

    const scoringCategories = Array.isArray(source.scoringCategories)
      ? source.scoringCategories.filter(
          (
            item,
          ): item is { name: string; type: "batting" | "pitching" } => {
            if (!item || typeof item !== "object") return false;
            const row = item as Record<string, unknown>;
            return (
              typeof row.name === "string" &&
              (row.type === "batting" || row.type === "pitching")
            );
          },
        )
      : undefined;

    if (
      source.name ||
      Number.isFinite(teams) ||
      Number.isFinite(budget) ||
      Number.isFinite(threshold) ||
      Number.isFinite(seasonYear) ||
      playerPool ||
      teamNames ||
      rosterSlots ||
      scoringCategories
    ) {
      return {
        name: typeof source.name === "string" ? source.name : undefined,
        teams: Number.isFinite(teams) ? teams : undefined,
        budget: Number.isFinite(budget) ? budget : undefined,
        posEligibilityThreshold: Number.isFinite(threshold) ? threshold : undefined,
        playerPool,
        rosterSlots,
        teamNames,
        scoringCategories,
        seasonYear: Number.isFinite(seasonYear) ? seasonYear : undefined,
      };
    }
  }

  return null;
}

function StepDots({ step }: { step: LeagueWizardStep }) {
  return (
    <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {[1, 2, 3, 4].map((value, index) => (
            <View key={value} style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: value <= step ? colors.purple2 : "#4c3575",
                  backgroundColor: value <= step ? colors.purple : "#241637",
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "900" }}>
                  {value}
                </Text>
              </View>

              {index < 3 ? (
                <View
                  style={{
                    width: 38,
                    height: 2,
                    backgroundColor: value < step ? colors.purple2 : "#4c3575",
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>

        <Text
          style={{
            color: colors.purple2,
            fontWeight: "900",
            marginTop: 10,
            letterSpacing: 1,
          }}
        >
          {STEP_LABELS[step].toUpperCase()}
        </Text>
      </View>
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
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Text style={{ color: colors.purple2, fontWeight: "900", letterSpacing: 1 }}>
          ROSTER SLOTS
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
            <Text style={{ color: "#ddd6fe", fontWeight: "900" }}>
              {row.position}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>
              {row.label}
            </Text>
          </View>

          <AppTextInput
            value={String(rosterSlots[row.position] ?? 0)}
            onChangeText={(value) =>
              onChange(row.position, Math.max(0, parseInteger(value, 0)))
            }
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

export default function CreateLeagueScreen({ navigation, route }: Props) {
  const { token, user } = useAuth();
  const { refreshLeagues } = useLeague();

  const openedFromDemoLink = route.params?.demo === true;
  const routeCheckpoint = route.params?.demoCheckpointKey ?? "pre_draft";

  const [step, setStep] = useState<LeagueWizardStep>(1);
  const [name, setName] = useState(DEFAULT_LEAGUE_NAME);
  const [teamsRaw, setTeamsRaw] = useState(String(DEFAULT_TEAM_COUNT));
  const [budgetRaw, setBudgetRaw] = useState(String(DEFAULT_BUDGET));
  const [posEligibilityRaw, setPosEligibilityRaw] = useState(
    String(DEFAULT_POS_ELIGIBILITY_THRESHOLD),
  );
  const [seasonYearRaw, setSeasonYearRaw] = useState(String(DEFAULT_SEASON_YEAR));
  const [playerPool, setPlayerPool] = useState<LeaguePlayerPool>("Mixed");
  const [rosterSlots, setRosterSlots] =
    useState<Record<string, number>>(DEFAULT_ROSTER_SLOTS);
  const [hittingStats, setHittingStats] = useState<string[]>(DEFAULT_HITTING_STATS);
  const [pitchingStats, setPitchingStats] =
    useState<string[]>(DEFAULT_PITCHING_STATS);
  const [teamNames, setTeamNames] = useState(() =>
    normalizeTeamNames(DEFAULT_TEAM_COUNT),
  );
  const [keepers, setKeepers] = useState<DraftKeeperEntry[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<EngineCheckpointKey>(routeCheckpoint);
  const [checkpointOpen, setCheckpointOpen] = useState(openedFromDemoLink);
  const [demoPresetApplied, setDemoPresetApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCheckpoint, setLoadingCheckpoint] = useState(false);
  const [error, setError] = useState("");

  const teamCount = clampNumber(
    parseInteger(teamsRaw, DEFAULT_TEAM_COUNT),
    LEAGUE_TEAMS_MIN,
    LEAGUE_TEAMS_MAX,
  );
  const budgetValue = Math.max(1, parseInteger(budgetRaw, DEFAULT_BUDGET));
  const posEligibilityValue = Math.max(
    1,
    parseInteger(posEligibilityRaw, DEFAULT_POS_ELIGIBILITY_THRESHOLD),
  );
  const seasonYear = Math.max(
    2000,
    parseInteger(seasonYearRaw, DEFAULT_SEASON_YEAR),
  );

  useEffect(() => {
    setTeamNames((current) => normalizeTeamNames(teamCount, current));
  }, [teamCount]);

  useEffect(() => {
    if (!openedFromDemoLink || demoPresetApplied || !token) return;

    setDemoPresetApplied(true);
    setCheckpointOpen(true);
    void handleApplyPreset(true);
  }, [openedFromDemoLink, demoPresetApplied, token]);

  const keeperLeagueShape = useMemo(
    () => ({
      teams: teamCount,
      teamNames,
      rosterSlots,
      posEligibilityThreshold: posEligibilityValue,
      playerPool,
    }),
    [playerPool, posEligibilityValue, rosterSlots, teamCount, teamNames],
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

  function validationError(): string | null {
    return validateBaseLeagueForm({
      name,
      teams: teamCount,
      budget: budgetValue,
      rosterSlots,
      hittingStats,
      pitchingStats,
      posEligibilityThreshold: posEligibilityValue,
    });
  }

  function goNext() {
    const formError = validationError();

    if (formError) {
      Alert.alert("Fix the form first", formError);
      return;
    }

    if (step < 4) {
      setStep((current) => (current + 1) as LeagueWizardStep);
      return;
    }

    void handleCreateLeague();
  }

  function goBack() {
    if (step === 1) {
      navigation.goBack();
      return;
    }

    setStep((current) => (current - 1) as LeagueWizardStep);
  }

  async function handleApplyPreset(silent = false) {
    if (!token) return;

    setLoadingCheckpoint(true);
    setError("");

    try {
      const raw = await fetchEngineCheckpointJson(token, selectedCheckpoint);
      const preset = extractCheckpointPreset(raw);

      const nextTeamCount = clampNumber(
        preset?.teams ?? 9,
        LEAGUE_TEAMS_MIN,
        LEAGUE_TEAMS_MAX,
      );

      setName(demoLeagueName(selectedCheckpoint));
      setTeamsRaw(String(nextTeamCount));
      setTeamNames(
        normalizeTeamNames(
          nextTeamCount,
          preset?.teamNames?.length ? preset.teamNames : demoTeamNames(nextTeamCount),
        ),
      );

      if (preset?.budget) setBudgetRaw(String(preset.budget));

      if (preset?.posEligibilityThreshold) {
        setPosEligibilityRaw(String(preset.posEligibilityThreshold));
      }

      if (preset?.seasonYear) setSeasonYearRaw(String(preset.seasonYear));
      if (preset?.playerPool) setPlayerPool(preset.playerPool);

      if (preset?.rosterSlots) {
        setRosterSlots(normalizeRosterSlots(preset.rosterSlots));
      }

      if (preset?.scoringCategories?.length) {
        setHittingStats(
          preset.scoringCategories
            .filter((category) => category.type === "batting")
            .map((category) => category.name),
        );

        setPitchingStats(
          preset.scoringCategories
            .filter((category) => category.type === "pitching")
            .map((category) => category.name),
        );
      }

      if (!silent) {
        Alert.alert("Preset applied", "Checkpoint settings were copied into the wizard.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to apply checkpoint preset.",
      );
    } finally {
      setLoadingCheckpoint(false);
    }
  }

  async function handleCreateDemoLeague() {
    if (!token) {
      Alert.alert("Not logged in", "Please log in again before creating a demo league.");
      return;
    }

    setLoadingCheckpoint(true);
    setError("");

    try {
      const league = await createLeagueFromEngineCheckpoint(token, {
        checkpoint_key: selectedCheckpoint,
        name: demoLeagueName(selectedCheckpoint),
        seasonYear,
      });

      await refreshLeagues();

      navigation.replace("LeagueTabs", {
        leagueId: league.id,
        leagueName: league.name,
        screen: "Research",
        params: { leagueId: league.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create demo league.");
    } finally {
      setLoadingCheckpoint(false);
    }
  }

  async function handleCreateLeague() {
    if (!token) {
      Alert.alert("Not logged in", "Please log in again before creating a league.");
      return;
    }

    const formError = validationError();

    if (formError) {
      Alert.alert("Fix the form first", formError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const league = await createLeague(
        {
          name: name.trim(),
          teams: teamCount,
          budget: budgetValue,
          scoringFormat: "roto",
          scoringCategories: buildScoringCategories(hittingStats, pitchingStats),
          rosterSlots,
          playerPool,
          posEligibilityThreshold: posEligibilityValue,
          teamNames: normalizeTeamNames(teamCount, teamNames),
          seasonYear,
        },
        token,
      );

      for (const keeper of keepers) {
        await addRosterEntry(
          league.id,
          {
            externalPlayerId: keeper.externalPlayerId,
            playerName: keeper.playerName,
            playerTeam: keeper.playerTeam,
            positions: keeper.positions,
            price: keeper.price,
            rosterSlot: keeper.rosterSlot,
            isKeeper: true,
            keeperContract: keeper.keeperContract,
            teamId: keeper.teamId,
            userId: user?.id,
          },
          token,
        );
      }

      await refreshLeagues();

      navigation.replace("LeagueTabs", {
        leagueId: league.id,
        leagueName: league.name,
        screen: "Research",
        params: { leagueId: league.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <StepDots step={step} />

        {error ? <ErrorState label={error} /> : null}

        {step === 1 ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: "900",
                marginBottom: 6,
              }}
            >
              League Setup
            </Text>

            <Text style={{ color: colors.muted, marginBottom: 14 }}>
              Configure league structure, player pool, and roster slots for your new
              league.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setCheckpointOpen((value) => !value)}
              style={{
                borderWidth: 1,
                borderColor: "#2b1a44",
                borderRadius: 12,
                padding: 12,
                marginBottom: 14,
                backgroundColor: "#0f0a18",
              }}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontWeight: "900",
                  letterSpacing: 0.5,
                }}
              >
                {checkpointOpen ? "▾" : "▸"} DEMO CHECKPOINTS (FIXTURES)
              </Text>
            </TouchableOpacity>

            {checkpointOpen ? (
              <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
                <Text style={{ color: colors.purple2, marginBottom: 10 }}>
                  Load Engine sandbox snapshots as real leagues or copy settings into
                  this wizard.
                </Text>

                {fieldLabel("Checkpoint")}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 12 }}
                >
                  {CHECKPOINT_OPTIONS.map((option) => (
                    <AppChip
                      key={option.key}
                      label={option.label}
                      selected={selectedCheckpoint === option.key}
                      onPress={() => setSelectedCheckpoint(option.key)}
                      style={{ marginRight: 8 }}
                    />
                  ))}
                </ScrollView>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      title="Apply preset to wizard"
                      variant="secondary"
                      loading={loadingCheckpoint}
                      disabled={loadingCheckpoint}
                      onPress={() => void handleApplyPreset()}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <AppButton
                      title="Create demo league & open"
                      loading={loadingCheckpoint}
                      disabled={loadingCheckpoint}
                      onPress={() => void handleCreateDemoLeague()}
                    />
                  </View>
                </View>
              </AppCard>
            ) : null}

            <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
              <AppTextInput label="League Name" value={name} onChangeText={setName} />

              <AppTextInput
                label="Teams"
                value={teamsRaw}
                onChangeText={setTeamsRaw}
                keyboardType="number-pad"
              />

              <Text style={{ color: colors.muted, marginTop: -6, marginBottom: 10 }}>
                {LEAGUE_TEAMS_MIN}–{LEAGUE_TEAMS_MAX} teams
              </Text>

              <AppTextInput
                label="Budget ($)"
                value={budgetRaw}
                onChangeText={setBudgetRaw}
                keyboardType="number-pad"
              />

              <AppTextInput
                label="Position Eligibility (min. games)"
                value={posEligibilityRaw}
                onChangeText={setPosEligibilityRaw}
                keyboardType="number-pad"
              />

              <AppTextInput
                label="Season Year"
                value={seasonYearRaw}
                onChangeText={setSeasonYearRaw}
                keyboardType="number-pad"
              />

              {fieldLabel("Player Pool")}

              <View style={{ gap: 10 }}>
                {PLAYER_POOL_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.apiValue}
                    activeOpacity={0.85}
                    onPress={() => setPlayerPool(option.apiValue)}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        playerPool === option.apiValue
                          ? colors.purple2
                          : colors.border,
                      backgroundColor:
                        playerPool === option.apiValue ? "#3b1d56" : colors.surface,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900" }}>
                      {option.label}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 3 }}>
                      {option.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </AppCard>

            <RosterSlotEditor rosterSlots={rosterSlots} onChange={updateRosterSlot} />
          </AppCard>
        ) : null}

        {step === 2 ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: "900",
                marginBottom: 6,
              }}
            >
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
                  onPress={() =>
                    setHittingStats((current) => toggleValue(current, stat.key))
                  }
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
                  onPress={() =>
                    setPitchingStats((current) => toggleValue(current, stat.key))
                  }
                  fullWidth
                  style={{ marginBottom: 8, alignItems: "flex-start" }}
                />
              ))}
            </AppCard>
          </AppCard>
        ) : null}

        {step === 3 ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: "900",
                marginBottom: 6,
              }}
            >
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

        {step === 4 ? (
          <AppCard backgroundColor="#120b1e" borderColor="#2b1a44">
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: "900",
                marginBottom: 6,
              }}
            >
              Keepers
            </Text>

            <Text style={{ color: colors.muted, marginBottom: 16 }}>
              Add optional pre-draft keepers before creating the league. You can also
              skip this step.
            </Text>

            <LeagueKeeperEditor
              mode="draft"
              league={keeperLeagueShape}
              token={token}
              userId={user?.id}
              draftKeepers={keepers}
              onDraftKeepersChange={setKeepers}
            />
          </AppCard>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <AppButton
              title={step === 1 ? "Cancel" : "Back"}
              variant="secondary"
              onPress={goBack}
            />
          </View>

          <View style={{ flex: 1 }}>
            <AppButton
              title={step === 4 ? (loading ? "Creating..." : "Create League") : "Continue"}
              loading={loading}
              disabled={loading}
              onPress={goNext}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}