import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getPlayers, getPlayersCached } from "../api/players";
import {
  addRosterEntry,
  getRoster,
  removeRosterEntry,
  type RosterEntry,
} from "../api/roster";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { Player } from "../types/player";
import { getEligibleSlotsForPositions } from "../utils/eligibility";

type Props = NativeStackScreenProps<RootStackParamList, "KeeperSettings">;

function teamIdFromIndex(index: number): string {
  return `team_${index + 1}`;
}

function teamNameFromId(teamId: string, teamNames: string[]): string {
  const index = Number.parseInt(teamId.replace("team_", ""), 10) - 1;
  return index >= 0 ? teamNames[index] ?? teamId : teamId;
}

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  if (teamNames && teamNames.length > 0) return teamNames.slice(0, teams);
  return Array.from({ length: teams }, (_, index) => `Team ${index + 1}`);
}

function playerSearch(players: Player[], query: string, takenIds: Set<string>): Player[] {
  const q = query.toLowerCase().trim();

  if (!q) return [];

  return players
    .filter((player) => !takenIds.has(player.id))
    .filter((player) => {
      return (
        player.name.toLowerCase().includes(q) ||
        player.team.toLowerCase().includes(q) ||
        player.position.toLowerCase().includes(q) ||
        (player.positions ?? []).some((pos) => pos.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
    .slice(0, 12);
}

export default function KeeperSettingsScreen({ route, navigation }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues, refreshLeagues } = useLeague();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const teamNames = useMemo(() => {
    if (!league) return [];
    return safeTeamNames(league.teams, league.teamNames);
  }, [league]);

  const [players, setPlayers] = useState<Player[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("team_1");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [slot, setSlot] = useState("");
  const [costRaw, setCostRaw] = useState("1");
  const [contract, setContract] = useState("");
  const [allowAnySlot, setAllowAnySlot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rosterSlotNames = useMemo(() => {
    return Object.entries(league?.rosterSlots ?? {})
      .filter(([, count]) => count > 0)
      .map(([name]) => name);
  }, [league]);

  const loadData = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!league || !token) return;

      if (mode === "load") setLoading(true);
      else setRefreshing(true);

      setError("");

      const cached = getPlayersCached(
        "adp",
        league.posEligibilityThreshold,
        league.playerPool,
      );

      if (cached) setPlayers(cached);

      try {
        const [nextPlayers, nextRoster] = await Promise.all([
          getPlayers("adp", league.posEligibilityThreshold, league.playerPool),
          getRoster(league.id, token),
        ]);

        setPlayers(nextPlayers);
        setRosterEntries(nextRoster);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load keepers.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [league, token],
  );

  useEffect(() => {
    void loadData("load");
  }, [loadData]);

  useEffect(() => {
    if (teamNames.length === 0) return;

    setSelectedTeamId((previous) => {
      const index = Number.parseInt(previous.replace("team_", ""), 10) - 1;

      if (index >= 0 && index < teamNames.length) return previous;

      return "team_1";
    });
  }, [teamNames.length]);

  const keeperEntries = useMemo(() => {
    return rosterEntries.filter((entry) => entry.isKeeper);
  }, [rosterEntries]);

  const selectedTeamKeepers = useMemo(() => {
    return keeperEntries
      .filter((entry) => entry.teamId === selectedTeamId)
      .sort((a, b) => a.rosterSlot.localeCompare(b.rosterSlot));
  }, [keeperEntries, selectedTeamId]);

  const takenIds = useMemo(() => {
    return new Set(keeperEntries.map((entry) => entry.externalPlayerId));
  }, [keeperEntries]);

  const searchResults = useMemo(() => {
    return playerSearch(players, searchQuery, takenIds);
  }, [players, searchQuery, takenIds]);

  const eligibleSlots = useMemo(() => {
    if (!selectedPlayer) return [];

    return getEligibleSlotsForPositions(
      selectedPlayer.positions,
      rosterSlotNames,
      selectedPlayer.position,
    );
  }, [selectedPlayer, rosterSlotNames]);

  const activeSlotOptions = allowAnySlot ? rosterSlotNames : eligibleSlots;

  useEffect(() => {
    if (!selectedPlayer) {
      setSlot("");
      return;
    }

    const options = allowAnySlot ? rosterSlotNames : eligibleSlots;
    setSlot(options[0] ?? "");
    setCostRaw(String(Math.max(1, Math.round(selectedPlayer.value || 1))));
  }, [selectedPlayer?.id, allowAnySlot, eligibleSlots.join("|"), rosterSlotNames.join("|")]);

  async function handleAddKeeper() {
    if (!league || !token || !selectedPlayer) return;

    const cost = Number.parseInt(costRaw, 10);

    if (!Number.isFinite(cost) || cost < 1) {
      Alert.alert("Invalid keeper cost", "Keeper cost must be at least $1.");
      return;
    }

    if (!slot) {
      Alert.alert("Missing slot", "Choose a roster slot for this keeper.");
      return;
    }

    setSaving(true);

    try {
      const entry = await addRosterEntry(
        league.id,
        {
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: selectedPlayer.positions ?? [selectedPlayer.position],
          price: cost,
          rosterSlot: slot,
          isKeeper: true,
          keeperContract: contract.trim() || undefined,
          teamId: selectedTeamId,
        },
        token,
      );

      setRosterEntries((current) => [entry, ...current]);
      setSelectedPlayer(null);
      setSearchQuery("");
      setSlot("");
      setCostRaw("1");
      setContract("");
      setAllowAnySlot(false);
      await refreshLeagues();
    } catch (err) {
      Alert.alert(
        "Could not add keeper",
        err instanceof Error ? err.message : "Failed to add keeper.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleRemoveKeeper(entry: RosterEntry) {
    if (!league || !token) return;

    Alert.alert("Remove keeper?", `Remove ${entry.playerName} from keepers?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeRosterEntry(league.id, entry._id, token);
            setRosterEntries((current) =>
              current.filter((item) => item._id !== entry._id),
            );
          } catch (err) {
            Alert.alert(
              "Remove failed",
              err instanceof Error ? err.message : "Could not remove keeper.",
            );
          }
        },
      },
    ]);
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  const selectedTeamName = teamNameFromId(selectedTeamId, teamNames);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadData("refresh")}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>
          Keeper Settings
        </Text>

        <Text style={{ color: colors.muted, marginTop: 4, marginBottom: 16 }}>
          Add and remove keeper players by team, slot, price, and contract.
        </Text>

        {error ? <ErrorState label={error} /> : null}

        {loading ? (
          <LoadingState label="Loading keeper data..." />
        ) : (
          <>
            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10 }}>
                Team
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {teamNames.map((teamName, index) => {
                  const teamId = teamIdFromIndex(index);
                  const count = keeperEntries.filter((entry) => entry.teamId === teamId).length;

                  return (
                    <AppChip
                      key={teamId}
                      label={`${teamName} (${count})`}
                      selected={selectedTeamId === teamId}
                      onPress={() => setSelectedTeamId(teamId)}
                      style={{ marginRight: 8 }}
                    />
                  );
                })}
              </ScrollView>
            </AppCard>

            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Add Keeper for {selectedTeamName}
              </Text>

              <TextInput
                placeholder="Search player..."
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={(value) => {
                  setSearchQuery(value);
                  setSelectedPlayer(null);
                }}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 12,
                }}
              />

              {!selectedPlayer && searchResults.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  onPress={() => setSelectedPlayer(player)}
                  style={{
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "800" }}>
                    {player.name}
                  </Text>
                  <Text style={{ color: colors.muted, marginTop: 2 }}>
                    {player.team} • {player.position} • ${player.value} • ADP {player.adp}
                  </Text>
                </TouchableOpacity>
              ))}

              {selectedPlayer ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: colors.gold, fontWeight: "800" }}>
                    Selected: {selectedPlayer.name}
                  </Text>

                  <Text style={{ color: colors.muted, marginTop: 8 }}>
                    Slot
                  </Text>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {activeSlotOptions.map((option) => (
                      <AppChip
                        key={option}
                        label={option}
                        selected={slot === option}
                        tone="info"
                        onPress={() => setSlot(option)}
                        style={{ marginRight: 8 }}
                      />
                    ))}
                  </ScrollView>

                  <View style={{ marginTop: 10 }}>
                    <AppChip
                      label={allowAnySlot ? "Override: Any Open Slot" : "Eligible Slots Only"}
                      selected={allowAnySlot}
                      tone="danger"
                      onPress={() => setAllowAnySlot((value) => !value)}
                    />
                  </View>

                  <Text style={{ color: colors.muted, marginTop: 12 }}>
                    Keeper cost
                  </Text>
                  <TextInput
                    value={costRaw}
                    onChangeText={setCostRaw}
                    keyboardType="number-pad"
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.text,
                      borderRadius: 10,
                      padding: 12,
                      marginTop: 6,
                    }}
                  />

                  <Text style={{ color: colors.muted, marginTop: 12 }}>
                    Contract label
                  </Text>
                  <TextInput
                    value={contract}
                    onChangeText={setContract}
                    placeholder="Arb / 3Y / Prospect"
                    placeholderTextColor={colors.muted}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.text,
                      borderRadius: 10,
                      padding: 12,
                      marginTop: 6,
                    }}
                  />

                  <View style={{ marginTop: 12 }}>
                    <Button
                      title={saving ? "Adding..." : "Add Keeper"}
                      disabled={saving || !slot}
                      onPress={() => void handleAddKeeper()}
                    />
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Button
                      title="Cancel Selection"
                      color="#6b7280"
                      onPress={() => setSelectedPlayer(null)}
                    />
                  </View>
                </View>
              ) : null}
            </AppCard>

            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 6 }}>
                {selectedTeamName} Keepers
              </Text>

              {selectedTeamKeepers.length === 0 ? (
                <EmptyState label="No keepers for this team yet." />
              ) : (
                selectedTeamKeepers.map((entry) => (
                  <View
                    key={entry._id}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {entry.playerName}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 3 }}>
                      {entry.playerTeam || "FA"} • {entry.rosterSlot} • ${entry.price}
                      {entry.keeperContract ? ` • ${entry.keeperContract}` : ""}
                    </Text>

                    <View style={{ marginTop: 10 }}>
                      <Button
                        title="Remove Keeper"
                        color="#b91c1c"
                        onPress={() => handleRemoveKeeper(entry)}
                      />
                    </View>
                  </View>
                ))
              )}
            </AppCard>

            <Button title="Back to Settings" onPress={() => navigation.goBack()} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}