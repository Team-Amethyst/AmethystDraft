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
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import {
  getRoster,
  removeRosterEntry,
  updateRosterEntry,
  type RosterEntry,
} from "../api/roster";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import type { LeagueTabParamList } from "../navigation/types";

type Props = BottomTabScreenProps<LeagueTabParamList, "Overview">;

type EntryEdit = {
  price: string;
  rosterSlot: string;
  teamId: string;
};

function teamIdFromIndex(index: number): string {
  return `team_${index + 1}`;
}

function teamNameFromId(teamId: string, teamNames: string[]): string {
  const index = Number.parseInt(teamId.replace("team_", ""), 10) - 1;

  if (index >= 0 && index < teamNames.length) {
    return teamNames[index] ?? teamId;
  }

  return teamId;
}

function formatMoney(value: number): string {
  return `$${Math.round(value)}`;
}

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  if (teamNames && teamNames.length > 0) {
    return teamNames.slice(0, teams);
  }

  return Array.from({ length: teams }, (_, index) => `Team ${index + 1}`);
}

function sortRosterEntries(entries: RosterEntry[]): RosterEntry[] {
  return [...entries].sort((a, b) => {
    const slotCompare = a.rosterSlot.localeCompare(b.rosterSlot);

    if (slotCompare !== 0) return slotCompare;

    return a.playerName.localeCompare(b.playerName);
  });
}

function sortDraftLog(entries: RosterEntry[]): RosterEntry[] {
  return [...entries].sort((a, b) => {
    const at = new Date(a.acquiredAt ?? a.createdAt).getTime();
    const bt = new Date(b.acquiredAt ?? b.createdAt).getTime();

    return bt - at;
  });
}

export default function LeagueOverviewScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const teamNames = useMemo(() => {
    if (!league) return [];
    return safeTeamNames(league.teams, league.teamNames);
  }, [league]);

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("team_1");
  const [edits, setEdits] = useState<Record<string, EntryEdit>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadRoster = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!token || !league) return;

      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const roster = await getRoster(league.id, token);
        setEntries(roster);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load league overview.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [league, token],
  );

  useEffect(() => {
    void loadRoster("load");
  }, [loadRoster]);

  useEffect(() => {
    if (teamNames.length === 0) {
      setSelectedTeamId("");
      return;
    }

    setSelectedTeamId((previous) => {
      if (previous) {
        const index = Number.parseInt(previous.replace("team_", ""), 10) - 1;

        if (index >= 0 && index < teamNames.length) {
          return previous;
        }
      }

      return "team_1";
    });
  }, [teamNames.length]);

  const totalSpent = useMemo(() => {
    return entries.reduce((sum, entry) => sum + entry.price, 0);
  }, [entries]);

  const teamSpent = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const entry of entries) {
      totals[entry.teamId] = (totals[entry.teamId] ?? 0) + entry.price;
    }

    return totals;
  }, [entries]);

  const selectedTeamEntries = useMemo(() => {
    return sortRosterEntries(
      entries.filter((entry) => entry.teamId === selectedTeamId),
    );
  }, [entries, selectedTeamId]);

  const draftLog = useMemo(() => {
    return sortDraftLog(entries);
  }, [entries]);

  function getEdit(entry: RosterEntry): EntryEdit {
    return (
      edits[entry._id] ?? {
        price: String(entry.price),
        rosterSlot: entry.rosterSlot,
        teamId: entry.teamId,
      }
    );
  }

  function updateEdit(entryId: string, patch: Partial<EntryEdit>) {
    setEdits((current) => {
      const entry = entries.find((item) => item._id === entryId);

      if (!entry) return current;

      const previous =
        current[entryId] ?? {
          price: String(entry.price),
          rosterSlot: entry.rosterSlot,
          teamId: entry.teamId,
        };

      return {
        ...current,
        [entryId]: {
          ...previous,
          ...patch,
        },
      };
    });
  }

  async function handleSaveEntry(entry: RosterEntry) {
    if (!token || !league) return;

    const edit = getEdit(entry);
    const parsedPrice = Number.parseInt(edit.price, 10);

    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      Alert.alert("Invalid price", "Price must be at least $1.");
      return;
    }

    if (!edit.rosterSlot.trim()) {
      Alert.alert("Invalid roster slot", "Roster slot cannot be empty.");
      return;
    }

    setSavingEntryId(entry._id);

    try {
      const updated = await updateRosterEntry(
        league.id,
        entry._id,
        {
          price: parsedPrice,
          rosterSlot: edit.rosterSlot.trim().toUpperCase(),
          teamId: edit.teamId,
        },
        token,
      );

      setEntries((current) =>
        current.map((item) => (item._id === entry._id ? updated : item)),
      );

      setEdits((current) => {
        const next = { ...current };
        delete next[entry._id];
        return next;
      });
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save this roster entry.",
      );
    } finally {
      setSavingEntryId(null);
    }
  }

  function handleRemoveEntry(entry: RosterEntry) {
    if (!token || !league) return;

    Alert.alert(
      "Remove player?",
      `Remove ${entry.playerName} from ${teamNameFromId(entry.teamId, teamNames)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeRosterEntry(league.id, entry._id, token);
              setEntries((current) =>
                current.filter((item) => item._id !== entry._id),
              );
            } catch (err) {
              Alert.alert(
                "Remove failed",
                err instanceof Error
                  ? err.message
                  : "Could not remove this player.",
              );
            }
          },
        },
      ],
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  const selectedTeamName = teamNameFromId(selectedTeamId, teamNames);
  const selectedTeamSpent = teamSpent[selectedTeamId] ?? 0;
  const selectedTeamRemaining = league.budget - selectedTeamSpent;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadRoster("refresh")}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 4 }}>
          League Overview
        </Text>

        <Text style={{ color: "#4b5563", marginBottom: 16 }}>
          Track team budgets, rosters, and the full draft log.
        </Text>

        {error ? <ErrorState label={error} /> : null}

        {loading ? (
          <LoadingState label="Loading league overview..." />
        ) : (
          <>
            <AppCard>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                League Summary
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <View style={{ minWidth: "45%" }}>
                  <Text style={{ color: "#6b7280" }}>Teams</Text>
                  <Text style={{ fontWeight: "700", fontSize: 18 }}>
                    {league.teams}
                  </Text>
                </View>

                <View style={{ minWidth: "45%" }}>
                  <Text style={{ color: "#6b7280" }}>Budget</Text>
                  <Text style={{ fontWeight: "700", fontSize: 18 }}>
                    {formatMoney(league.budget)}
                  </Text>
                </View>

                <View style={{ minWidth: "45%" }}>
                  <Text style={{ color: "#6b7280" }}>Players Drafted</Text>
                  <Text style={{ fontWeight: "700", fontSize: 18 }}>
                    {entries.length}
                  </Text>
                </View>

                <View style={{ minWidth: "45%" }}>
                  <Text style={{ color: "#6b7280" }}>Total Spent</Text>
                  <Text style={{ fontWeight: "700", fontSize: 18 }}>
                    {formatMoney(totalSpent)}
                  </Text>
                </View>
              </View>
            </AppCard>

            <AppCard>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                Team Budgets
              </Text>

              {teamNames.map((teamName, index) => {
                const teamId = teamIdFromIndex(index);
                const spent = teamSpent[teamId] ?? 0;
                const remaining = league.budget - spent;
                const selected = selectedTeamId === teamId;

                return (
                  <TouchableOpacity
                    key={teamId}
                    onPress={() => setSelectedTeamId(teamId)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? "#111827" : "#e5e7eb",
                      backgroundColor: selected ? "#f3f4f6" : "white",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontWeight: "700" }}>{teamName}</Text>
                    <Text style={{ color: "#4b5563", marginTop: 3 }}>
                      Spent {formatMoney(spent)} • Left {formatMoney(remaining)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </AppCard>

            <AppCard>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>
                {selectedTeamName} Roster
              </Text>

              <Text style={{ color: "#6b7280", marginBottom: 12 }}>
                {selectedTeamEntries.length} players •{" "}
                {formatMoney(selectedTeamRemaining)} remaining
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
              >
                {teamNames.map((teamName, index) => {
                  const teamId = teamIdFromIndex(index);

                  return (
                    <AppChip
                      key={teamId}
                      label={teamName}
                      selected={selectedTeamId === teamId}
                      onPress={() => setSelectedTeamId(teamId)}
                      style={{ marginRight: 8 }}
                    />
                  );
                })}
              </ScrollView>

              {selectedTeamEntries.length === 0 ? (
                <EmptyState label="No players on this team yet." />
              ) : (
                selectedTeamEntries.map((entry) => {
                  const edit = getEdit(entry);
                  const isSaving = savingEntryId === entry._id;

                  return (
                    <View
                      key={entry._id}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: "#f1f5f9",
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ fontWeight: "700", fontSize: 16 }}>
                        {entry.playerName}
                      </Text>

                      <Text style={{ color: "#4b5563", marginTop: 2 }}>
                        {entry.playerTeam || "FA"} •{" "}
                        {(entry.positions ?? []).join("/") || entry.rosterSlot}
                        {entry.isKeeper ? " • Keeper" : ""}
                        {entry.keeperContract ? ` • ${entry.keeperContract}` : ""}
                      </Text>

                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#6b7280", marginBottom: 4 }}>
                            Price
                          </Text>
                          <TextInput
                            value={edit.price}
                            keyboardType="number-pad"
                            onChangeText={(value) =>
                              updateEdit(entry._id, { price: value })
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: "#d1d5db",
                              borderRadius: 8,
                              padding: 10,
                            }}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#6b7280", marginBottom: 4 }}>
                            Slot
                          </Text>
                          <TextInput
                            value={edit.rosterSlot}
                            autoCapitalize="characters"
                            onChangeText={(value) =>
                              updateEdit(entry._id, { rosterSlot: value })
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: "#d1d5db",
                              borderRadius: 8,
                              padding: 10,
                            }}
                          />
                        </View>
                      </View>

                      <Text style={{ color: "#6b7280", marginTop: 10 }}>
                        Move to team
                      </Text>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginTop: 8 }}
                      >
                        {teamNames.map((teamName, index) => {
                          const teamId = teamIdFromIndex(index);
                          const selected = edit.teamId === teamId;

                          return (
                            <TouchableOpacity
                              key={teamId}
                              onPress={() => updateEdit(entry._id, { teamId })}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 7,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: selected ? "#111827" : "#d1d5db",
                                backgroundColor: selected ? "#111827" : "white",
                                marginRight: 8,
                              }}
                            >
                              <Text
                                style={{
                                  color: selected ? "white" : "#111827",
                                  fontWeight: "600",
                                }}
                              >
                                {teamName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                        <Button
                          title={isSaving ? "Saving..." : "Save"}
                          disabled={isSaving}
                          onPress={() => void handleSaveEntry(entry)}
                        />
                        <Button
                          title="Remove"
                          color="#b91c1c"
                          onPress={() => handleRemoveEntry(entry)}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </AppCard>

            <AppCard>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
                Draft Log
              </Text>

              {draftLog.length === 0 ? (
                <EmptyState label="No draft picks logged yet." />
              ) : (
                draftLog.map((entry, index) => (
                  <View
                    key={entry._id}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#f1f5f9",
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ fontWeight: "700" }}>
                      #{draftLog.length - index} {entry.playerName}
                    </Text>

                    <Text style={{ color: "#4b5563", marginTop: 2 }}>
                      {teamNameFromId(entry.teamId, teamNames)} •{" "}
                      {entry.rosterSlot} • {formatMoney(entry.price)}
                      {entry.isKeeper ? " • Keeper" : ""}
                    </Text>

                    <Text style={{ color: "#6b7280", marginTop: 2 }}>
                      {new Date(entry.acquiredAt ?? entry.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </AppCard>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}