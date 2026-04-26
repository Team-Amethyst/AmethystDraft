import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getMockPick,
  getNewsSignals,
  getScarcity,
  getValuation,
  getValuationPlayer,
  type MockPickPrediction,
  type ScarcityResponse,
  type ValuationPlayerResponse,
} from "../api/engine";
import { getPlayers } from "../api/players";
import {
  addRosterEntry,
  getRoster,
  removeRosterEntry,
  updateRosterEntry,
  type RosterEntry,
} from "../api/roster";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { Player } from "../types/player";
import { computeTeamData } from "../utils/commandCenterUtils";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { LeagueTabParamList } from "../navigation/types";

const LOCAL_POSITIONS = ["C", "1B", "2B", "SS", "3B", "OF", "SP", "RP"];

function playerMatchesPosition(player: Player, position: string): boolean {
  const target = position.toUpperCase();

  const direct = player.position
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .includes(target);

  const multi = (player.positions ?? []).map((p) => p.toUpperCase()).includes(target);

  if (direct || multi) return true;

  if (target === "OF") {
    return ["LF", "CF", "RF"].some((p) =>
      player.position.toUpperCase().includes(p),
    );
  }

  return false;
}

function rosterEntryMatchesPosition(entry: RosterEntry, position: string): boolean {
  const target = position.toUpperCase();

  if (entry.rosterSlot.toUpperCase() === target) {
    return true;
  }

  return (entry.positions ?? []).map((p) => p.toUpperCase()).includes(target);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function severityColors(
  severity?: "low" | "medium" | "high" | "critical",
): { bg: string; fg: string } {
  switch (severity) {
    case "critical":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "high":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "medium":
      return { bg: "#ede9fe", fg: "#6d28d9" };
    case "low":
      return { bg: "#dcfce7", fg: "#166534" };
    default:
      return { bg: "#e5e7eb", fg: "#374151" };
  }
}

function teamNameFromId(teamId: string, teamNames?: string[]): string {
  const idx = parseInt(teamId.replace("team_", ""), 10) - 1;
  return idx >= 0 ? teamNames?.[idx] ?? teamId : teamId;
}

type Props = BottomTabScreenProps<LeagueTabParamList, "CommandCenter">;
export default function CommandCenterScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token, user } = useAuth();
  const { allLeagues } = useLeague();
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { getNote, loadNotes, setNote } = usePlayerNotes();

  const [players, setPlayers] = useState<Player[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingPick, setAddingPick] = useState(false);

  const [teamNumber, setTeamNumber] = useState("1");
  const [price, setPrice] = useState("");
  const [rosterSlot, setRosterSlot] = useState("");

  const [editingPickId, setEditingPickId] = useState<string | null>(null);
  const [editTeamNumber, setEditTeamNumber] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editSlot, setEditSlot] = useState("");
  const [workingPickId, setWorkingPickId] = useState<string | null>(null);

  const [engineScarcity, setEngineScarcity] = useState<ScarcityResponse | null>(
    null,
  );
  const [newsStrip, setNewsStrip] = useState<string | null>(null);
  const [valuationSnapshot, setValuationSnapshot] =
    useState<ValuationPlayerResponse | null>(null);
  const [valuationMarketNotes, setValuationMarketNotes] = useState<string[]>([]);

  const [mockPredictions, setMockPredictions] = useState<MockPickPrediction[]>([]);
  const [loadingMockPicks, setLoadingMockPicks] = useState(false);

  const league = allLeagues.find((item) => item.id === leagueId);

  async function refreshRosterAndEngine() {
    if (!token) return;

    const [rosterData, valuationData] = await Promise.all([
      getRoster(leagueId, token),
      getValuation(leagueId, token, "team_1").catch(() => null),
    ]);

    setRoster(rosterData);

    if (valuationData) {
      setValuationSnapshot(valuationData);
      setValuationMarketNotes(valuationData.market_notes ?? []);
    }
  }

  useEffect(() => {
    async function loadData() {
      if (!token || !league) return;

      try {
        const [playerData, rosterData, _notesLoaded, valuationData] = await Promise.all([
          getPlayers("adp", league.posEligibilityThreshold, league.playerPool),
          getRoster(leagueId, token),
          loadNotes(leagueId),
          getValuation(leagueId, token, "team_1").catch(() => null),
        ]);

        setPlayers(playerData);
        setRoster(rosterData);

        if (valuationData) {
          setValuationSnapshot(valuationData);
          setValuationMarketNotes(valuationData.market_notes ?? []);
        }
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [league, leagueId, loadNotes, token]);

  useEffect(() => {
    if (!selectedPlayer) return;
    if (selectedPlayer.mlbId !== 0) return;

    const fullPlayer = players.find((p) => p.id === selectedPlayer.id);
    if (fullPlayer) {
      setSelectedPlayer(fullPlayer);
    }
  }, [players, selectedPlayer, setSelectedPlayer]);

  useEffect(() => {
    if (!selectedPlayer) return;

    if (!rosterSlot) {
      const defaultSlot =
        selectedPlayer.positions?.[0] ??
        selectedPlayer.position.split("/")[0] ??
        "";

      setRosterSlot(defaultSlot);
    }
  }, [selectedPlayer, rosterSlot]);

  useEffect(() => {
    if (!token) {
      const clear = setTimeout(() => setNewsStrip(null), 0);
      return () => clearTimeout(clear);
    }

    const handle = setTimeout(() => {
      void getNewsSignals(token, { days: 7 })
        .then((response) => {
          setNewsStrip(
            response.count > 0
              ? `${response.count} news signal${response.count === 1 ? "" : "s"} (7d, Engine)`
              : null,
          );
        })
        .catch(() => setNewsStrip(null));
    }, 1500);

    return () => clearTimeout(handle);
  }, [token]);

  useEffect(() => {
    if (!leagueId || !token || !selectedPlayer) return;

    let cancelled = false;

    void getValuationPlayer(leagueId, token, selectedPlayer.id, "team_1")
      .then((response) => {
        if (cancelled) return;
        setValuationSnapshot(response);
        setValuationMarketNotes(response.market_notes ?? []);
      })
      .catch(() => {
        // best-effort
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId, token, selectedPlayer?.id]);

  const primaryPosition = useMemo(() => {
    if (!selectedPlayer) return null;
    return (
      selectedPlayer.positions?.[0] ??
      selectedPlayer.position.split("/")[0] ??
      null
    );
  }, [selectedPlayer]);

  useEffect(() => {
    if (!leagueId || !token || !primaryPosition) {
      setEngineScarcity(null);
      return;
    }

    let cancelled = false;

    void getScarcity(leagueId, token, primaryPosition)
      .then((data) => {
        if (!cancelled) {
          setEngineScarcity(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEngineScarcity(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId, token, primaryPosition, roster.length]);

  const draftedIds = useMemo(
    () => new Set(roster.map((entry) => entry.externalPlayerId)),
    [roster],
  );

  const localPositionMarket = useMemo(() => {
    if (!primaryPosition) return null;

    const undraftedAtPos = players.filter(
      (player) =>
        !draftedIds.has(player.id) && playerMatchesPosition(player, primaryPosition),
    );

    const draftedAtPos = roster.filter((entry) =>
      rosterEntryMatchesPosition(entry, primaryPosition),
    );

    const avgCatalogValue = average(undraftedAtPos.map((player) => player.value));
    const avgPaid = average(draftedAtPos.map((entry) => entry.price));
    const delta = avgPaid - avgCatalogValue;

    const rankedCounts = LOCAL_POSITIONS.map((position) => ({
      position,
      count: players.filter(
        (player) =>
          !draftedIds.has(player.id) && playerMatchesPosition(player, position),
      ).length,
    })).sort((a, b) => b.count - a.count);

    const supplyRankNum =
      rankedCounts.findIndex((item) => item.position === primaryPosition) + 1;

    return {
      position: primaryPosition,
      remainingCount: undraftedAtPos.length,
      avgCatalogValue,
      avgPaid,
      delta,
      supplyRankNum: supplyRankNum > 0 ? supplyRankNum : rankedCounts.length,
      supplyRankOf: rankedCounts.length,
    };
  }, [draftedIds, players, primaryPosition, roster]);

  const enginePosRow = useMemo(() => {
    if (!engineScarcity || !primaryPosition) return null;

    return (
      engineScarcity.positions.find(
        (position) => position.position.toUpperCase() === primaryPosition.toUpperCase(),
      ) ?? engineScarcity.positions[0] ?? null
    );
  }, [engineScarcity, primaryPosition]);

  const selectedPositionExplainer =
    engineScarcity?.selected_position_explainer ?? null;

  const selectedTierBuckets = useMemo(() => {
    if (!engineScarcity || !primaryPosition) return [];

    const exact =
      engineScarcity.tier_buckets?.find(
        (bucket) =>
          bucket.position.toUpperCase() === primaryPosition.toUpperCase(),
      ) ?? null;

    return exact?.buckets ?? [];
  }, [engineScarcity, primaryPosition]);

  const teamData = useMemo(() => {
    if (!league) return [];

    return computeTeamData(
      {
        teamNames: league.teamNames,
        rosterSlots: league.rosterSlots,
        budget: league.budget,
      },
      roster,
    );
  }, [league, roster]);

  const recentPicks = useMemo(() => {
    return [...roster]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 20);
  }, [roster]);

  const focusedValuation = useMemo(() => {
    if (!selectedPlayer || !valuationSnapshot) return null;

    return (
      valuationSnapshot.player ??
      valuationSnapshot.valuations.find((row) => row.player_id === selectedPlayer.id) ??
      null
    );
  }, [selectedPlayer, valuationSnapshot]);

  useEffect(() => {
    if (!leagueId || !token || !league || players.length === 0) {
      setMockPredictions([]);
      return;
    }

    const budgetByTeamId = Object.fromEntries(
      league.teamNames.map((_, index) => {
        const key = `team_${index + 1}`;
        const team = teamData[index];
        return [key, team?.remaining ?? league.budget];
      }),
    );

    const availablePlayerIds = players
      .filter((player) => !draftedIds.has(player.id))
      .slice(0, 250)
      .map((player) => player.id);

    let cancelled = false;
    setLoadingMockPicks(true);

    void getMockPick(leagueId, token, budgetByTeamId, availablePlayerIds)
      .then((response) => {
        if (!cancelled) {
          setMockPredictions(response.predictions ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMockPredictions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMockPicks(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [league, leagueId, token, players, draftedIds, teamData]);

  function startEditingPick(entry: RosterEntry) {
    const teamNum = entry.teamId.replace("team_", "");
    setEditingPickId(entry._id);
    setEditTeamNumber(teamNum);
    setEditPrice(String(entry.price));
    setEditSlot(entry.rosterSlot);
  }

  function cancelEditingPick() {
    setEditingPickId(null);
    setEditTeamNumber("1");
    setEditPrice("");
    setEditSlot("");
  }

  function openPlayerById(playerId: string) {
    const found = players.find((player) => player.id === playerId);

    if (!found) {
      Alert.alert("Player not found", "That player is not currently in the loaded catalog.");
      return;
    }

    setSelectedPlayer(found);
  }

  async function handleSavePick(entry: RosterEntry) {
    if (!token || !league) return;

    const nextTeam = Number(editTeamNumber);
    const nextPrice = Number(editPrice);
    const nextSlot = editSlot.trim().toUpperCase();

    if (!Number.isInteger(nextTeam) || nextTeam < 1 || nextTeam > league.teams) {
      Alert.alert(
        "Invalid team number",
        `Enter a team number from 1 to ${league.teams}.`,
      );
      return;
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      Alert.alert("Invalid price", "Enter a non-negative price.");
      return;
    }

    if (!nextSlot) {
      Alert.alert("Invalid slot", "Enter a roster slot such as OF or SP.");
      return;
    }

    setWorkingPickId(entry._id);

    try {
      await updateRosterEntry(
        leagueId,
        entry._id,
        {
          price: nextPrice,
          rosterSlot: nextSlot,
          teamId: `team_${nextTeam}`,
        },
        token,
      );

      await refreshRosterAndEngine();
      cancelEditingPick();
      Alert.alert("Pick updated", `${entry.playerName} was updated.`);
    } catch (err) {
      Alert.alert(
        "Failed to update pick",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setWorkingPickId(null);
    }
  }

  async function handleDeletePick(entry: RosterEntry) {
    if (!token) return;

    setWorkingPickId(entry._id);

    try {
      await removeRosterEntry(leagueId, entry._id, token);
      await refreshRosterAndEngine();

      if (editingPickId === entry._id) {
        cancelEditingPick();
      }

      Alert.alert("Pick removed", `${entry.playerName} was removed.`);
    } catch (err) {
      Alert.alert(
        "Failed to remove pick",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setWorkingPickId(null);
    }
  }

  async function handleAddPick() {
    if (!token || !selectedPlayer || !league) return;

    const teamValue = Number(teamNumber);
    const priceValue = Number(price);

    if (!Number.isInteger(teamValue) || teamValue < 1 || teamValue > league.teams) {
      Alert.alert(
        "Invalid team number",
        `Enter a team number from 1 to ${league.teams}.`,
      );
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      Alert.alert("Invalid price", "Enter a non-negative price.");
      return;
    }

    if (!rosterSlot.trim()) {
      Alert.alert("Missing roster slot", "Enter a roster slot such as OF or SP.");
      return;
    }

    setAddingPick(true);

    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: selectedPlayer.positions ?? [selectedPlayer.position],
          price: priceValue,
          rosterSlot: rosterSlot.trim().toUpperCase(),
          isKeeper: false,
          userId: user?.id,
          teamId: `team_${teamValue}`,
        },
        token,
      );

      await refreshRosterAndEngine();
      setPrice("");
      Alert.alert("Pick logged", `${selectedPlayer.name} was added to Team ${teamValue}.`);
    } catch (err) {
      Alert.alert(
        "Failed to log pick",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setAddingPick(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Text>League not found.</Text>
      </SafeAreaView>
    );
  }

  const playerNote =
    selectedPlayer ? getNote(leagueId, selectedPlayer.id) : "";

  const draftRoomNote = getNote(leagueId, "__draft__");
  const explainerColors = severityColors(selectedPositionExplainer?.severity);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
          Command Center
        </Text>

        {newsStrip ? (
          <View
            style={{
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#eff6ff",
              borderWidth: 1,
              borderColor: "#bfdbfe",
              marginBottom: 14,
            }}
          >
            <Text style={{ color: "#1e3a8a", fontWeight: "600" }}>{newsStrip}</Text>
          </View>
        ) : null}

        <View
          style={{
            padding: 14,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            marginBottom: 16,
            backgroundColor: "#fcfcfc",
          }}
        >
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>
            Draft Room Notes
          </Text>
          <TextInput
            value={draftRoomNote}
            onChangeText={(text) => setNote(leagueId, "__draft__", text)}
            placeholder="League-wide strategy, budget rules, target positions, fades..."
            multiline
            style={{
              minHeight: 110,
              borderWidth: 1,
              borderColor: "#cbd5e1",
              borderRadius: 8,
              padding: 10,
              backgroundColor: "white",
              textAlignVertical: "top",
            }}
          />
        </View>

        {selectedPlayer ? (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#c7d2fe",
              borderRadius: 10,
              backgroundColor: "#eef2ff",
              marginBottom: 16,
            }}
          >
            <Text style={{ fontWeight: "700", fontSize: 16 }}>
              Selected Player
            </Text>
            <Text style={{ marginTop: 6 }}>{selectedPlayer.name}</Text>
            <Text>
              {selectedPlayer.team} • {selectedPlayer.position}
            </Text>
            <Text>
              ADP {selectedPlayer.adp} • ${selectedPlayer.value}
            </Text>
            {!!selectedPlayer.positions?.length && (
              <Text style={{ marginTop: 4 }}>
                Eligible: {selectedPlayer.positions.join(", ")}
              </Text>
            )}

            {focusedValuation ? (
              <View
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: "#ffffff",
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                }}
              >
                <Text style={{ fontWeight: "700", marginBottom: 4 }}>
                  Engine Player View
                </Text>
                <Text>Adjusted ${focusedValuation.adjusted_value}</Text>
                <Text>Baseline ${focusedValuation.baseline_value}</Text>
                <Text>Tier {focusedValuation.tier}</Text>
                {focusedValuation.recommended_bid !== undefined ? (
                  <Text>Recommended bid ${focusedValuation.recommended_bid}</Text>
                ) : null}
                <Text style={{ marginTop: 4, color: "#6b7280" }}>
                  {focusedValuation.indicator}
                </Text>
              </View>
            ) : null}

            <Text style={{ marginTop: 10, marginBottom: 6, fontWeight: "600" }}>
              Log Pick
            </Text>

            <TextInput
              value={teamNumber}
              onChangeText={setTeamNumber}
              placeholder={`Team number 1-${league.teams}`}
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: "#cbd5e1",
                borderRadius: 8,
                padding: 10,
                backgroundColor: "white",
                marginBottom: 8,
              }}
            />

            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="Auction price"
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: "#cbd5e1",
                borderRadius: 8,
                padding: 10,
                backgroundColor: "white",
                marginBottom: 8,
              }}
            />

            <TextInput
              value={rosterSlot}
              onChangeText={setRosterSlot}
              placeholder="Roster slot e.g. OF, SP, RP"
              autoCapitalize="characters"
              style={{
                borderWidth: 1,
                borderColor: "#cbd5e1",
                borderRadius: 8,
                padding: 10,
                backgroundColor: "white",
                marginBottom: 10,
              }}
            />

            <Button
              title={addingPick ? "Logging..." : "Log Pick"}
              onPress={() => void handleAddPick()}
              disabled={addingPick}
            />

            <Text style={{ marginTop: 12, marginBottom: 6, fontWeight: "600" }}>
              Player Notes
            </Text>
            <TextInput
              value={playerNote}
              onChangeText={(text) =>
                setNote(leagueId, selectedPlayer.id, text)
              }
              placeholder="Write a draft note for this player"
              multiline
              style={{
                minHeight: 90,
                borderWidth: 1,
                borderColor: "#cbd5e1",
                borderRadius: 8,
                padding: 10,
                backgroundColor: "white",
                textAlignVertical: "top",
              }}
            />
          </View>
        ) : (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <Text>Select a player from Research or My Draft.</Text>
          </View>
        )}

        {valuationSnapshot ? (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#ddd6fe",
              borderRadius: 10,
              marginBottom: 16,
              backgroundColor: "#faf5ff",
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Engine Context
            </Text>

            {valuationMarketNotes.map((note, index) => (
              <Text key={index} style={{ marginBottom: 6 }}>
                • {note}
              </Text>
            ))}

            <Text style={{ marginTop: valuationMarketNotes.length > 0 ? 6 : 0 }}>
              Inflation {valuationSnapshot.inflation_factor.toFixed(2)}×
            </Text>
            <Text>
              ${valuationSnapshot.total_budget_remaining} budget left
            </Text>
            <Text>
              {valuationSnapshot.players_remaining} players left
            </Text>
            {valuationSnapshot.valuation_model_version ? (
              <Text>Model {valuationSnapshot.valuation_model_version}</Text>
            ) : null}
            {valuationSnapshot.context_v2?.market_summary?.headline ? (
              <Text style={{ marginTop: 8, color: "#6b7280" }}>
                {valuationSnapshot.context_v2.market_summary.headline}
              </Text>
            ) : null}
          </View>
        ) : null}

        {loadingMockPicks ? (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 6 }}>
              Mock Pick Predictions
            </Text>
            <ActivityIndicator />
          </View>
        ) : mockPredictions.length > 0 ? (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 10,
              marginBottom: 16,
              backgroundColor: "#fafafa",
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 10 }}>
              Mock Pick Predictions
            </Text>

            {mockPredictions.slice(0, 5).map((prediction, index) => (
              <View
                key={`${prediction.team_id}-${prediction.pick_position}-${index}`}
                style={{
                  paddingVertical: 10,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#e5e7eb",
                }}
              >
                <Text style={{ fontWeight: "600" }}>
                  {teamNameFromId(prediction.team_id, league.teamNames)} • Pick {prediction.pick_position}
                </Text>
                <Text style={{ marginTop: 2 }}>
                  {prediction.predicted_player.name} • {prediction.predicted_player.position}
                </Text>
                <Text style={{ color: "#6b7280", marginTop: 2 }}>
                  ADP {prediction.predicted_player.adp} • confidence{" "}
                  {(prediction.confidence * 100).toFixed(0)}%
                </Text>
                <Text style={{ color: "#6b7280", marginTop: 2 }}>
                  {prediction.predicted_player.reason}
                </Text>

                <View style={{ marginTop: 8, flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => openPlayerById(prediction.predicted_player.player_id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: "#111827",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>
                      Open Player
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {localPositionMarket ? (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 10,
              marginBottom: 16,
              backgroundColor: "#fafafa",
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Market • {localPositionMarket.position}
            </Text>
            <Text>
              AVG CATALOG $: ${localPositionMarket.avgCatalogValue.toFixed(1)}
            </Text>
            <Text>
              AVG PAID $: ${localPositionMarket.avgPaid.toFixed(1)}
            </Text>
            <Text>
              SPEND VS CATALOG: {localPositionMarket.delta >= 0 ? "+" : ""}
              {localPositionMarket.delta.toFixed(1)}
            </Text>
            <Text>REMAINING COUNT: {localPositionMarket.remainingCount}</Text>
            <Text style={{ color: "#6b7280", marginTop: 6 }}>
              Count rank (local): {localPositionMarket.supplyRankNum} /{" "}
              {localPositionMarket.supplyRankOf}
            </Text>
          </View>
        ) : null}

        {enginePosRow ? (
          <View
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#dbeafe",
              borderRadius: 10,
              marginBottom: 16,
              backgroundColor: "#f8fbff",
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Engine Scarcity • {enginePosRow.position}
            </Text>

            <Text>SCORE: {enginePosRow.scarcity_score}</Text>
            <Text>
              ELITE / MID / TOTAL: {enginePosRow.elite_remaining} /{" "}
              {enginePosRow.mid_tier_remaining} / {enginePosRow.total_remaining}
            </Text>

            {enginePosRow.alert ? (
              <Text style={{ marginTop: 6 }}>{enginePosRow.alert}</Text>
            ) : null}

            {selectedPositionExplainer ? (
              <View
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: explainerColors.bg,
                }}
              >
                <Text
                  style={{
                    color: explainerColors.fg,
                    fontWeight: "700",
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {selectedPositionExplainer.severity}
                </Text>
                <Text style={{ color: explainerColors.fg }}>
                  {selectedPositionExplainer.message}
                </Text>
                <Text style={{ color: explainerColors.fg, marginTop: 4 }}>
                  {selectedPositionExplainer.recommended_action}
                </Text>
              </View>
            ) : null}

            {selectedTierBuckets.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontWeight: "600", marginBottom: 6 }}>
                  Tier Buckets
                </Text>
                {selectedTierBuckets.map((bucket) => (
                  <View
                    key={bucket.tier}
                    style={{
                      paddingVertical: 6,
                      borderTopWidth: 1,
                      borderTopColor: "#e5e7eb",
                    }}
                  >
                    <Text>
                      {bucket.tier}: {bucket.remaining} left • urgency {bucket.urgency_score}
                    </Text>
                    {bucket.message ? (
                      <Text style={{ color: "#6b7280", marginTop: 2 }}>
                        {bucket.message}
                      </Text>
                    ) : null}
                    {bucket.recommended_action ? (
                      <Text style={{ color: "#6b7280", marginTop: 2 }}>
                        {bucket.recommended_action}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {engineScarcity &&
            engineScarcity.monopoly_warnings.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontWeight: "600", marginBottom: 4 }}>
                  Monopoly Warnings
                </Text>
                {engineScarcity.monopoly_warnings.slice(0, 2).map((warning, index) => (
                  <Text key={index} style={{ marginBottom: 4 }}>
                    • {warning.message}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={{ marginBottom: 16 }}>
          Players loaded: {players.length} | Picks logged: {roster.length}
        </Text>

        <FlatList
          data={teamData}
          keyExtractor={(item) => item.name}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View
              style={{
                padding: 14,
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontWeight: "700" }}>{item.name}</Text>
              <Text>Spent: ${item.spent}</Text>
              <Text>Remaining: ${item.remaining}</Text>
              <Text>Open spots: {item.open}</Text>
              <Text>Max bid: ${item.maxBid}</Text>
              <Text>$ / spot: {item.ppSpot}</Text>
            </View>
          )}
          ListEmptyComponent={<Text>No team data yet.</Text>}
        />

        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            marginTop: 18,
            marginBottom: 10,
          }}
        >
          Recent Picks
        </Text>

        {recentPicks.length === 0 ? (
          <Text>No picks yet.</Text>
        ) : (
          recentPicks.map((pick) => {
            const isEditing = editingPickId === pick._id;
            const isWorking = workingPickId === pick._id;

            return (
              <View
                key={pick._id}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#eee",
                }}
              >
                <Text style={{ fontWeight: "600" }}>{pick.playerName}</Text>
                <Text style={{ marginBottom: 6 }}>
                  {teamNameFromId(pick.teamId, league.teamNames)} • {pick.rosterSlot} • $
                  {pick.price}
                </Text>

                {isEditing ? (
                  <View>
                    <TextInput
                      value={editTeamNumber}
                      onChangeText={setEditTeamNumber}
                      placeholder={`Team 1-${league.teams}`}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: "#cbd5e1",
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: "white",
                        marginBottom: 8,
                      }}
                    />

                    <TextInput
                      value={editPrice}
                      onChangeText={setEditPrice}
                      placeholder="Price"
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: "#cbd5e1",
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: "white",
                        marginBottom: 8,
                      }}
                    />

                    <TextInput
                      value={editSlot}
                      onChangeText={setEditSlot}
                      placeholder="Roster slot"
                      autoCapitalize="characters"
                      style={{
                        borderWidth: 1,
                        borderColor: "#cbd5e1",
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: "white",
                        marginBottom: 10,
                      }}
                    />

                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      <View style={{ marginRight: 8, marginBottom: 8 }}>
                        <Button
                          title={isWorking ? "Saving..." : "Save"}
                          onPress={() => void handleSavePick(pick)}
                          disabled={isWorking}
                        />
                      </View>
                      <View style={{ marginRight: 8, marginBottom: 8 }}>
                        <Button
                          title="Cancel"
                          onPress={cancelEditingPick}
                          disabled={isWorking}
                        />
                      </View>
                      <View style={{ marginRight: 8, marginBottom: 8 }}>
                        <Button
                          title={isWorking ? "Deleting..." : "Delete"}
                          onPress={() => void handleDeletePick(pick)}
                          disabled={isWorking}
                        />
                      </View>
                      <View style={{ marginBottom: 8 }}>
                        <Button
                          title="Open"
                          onPress={() => openPlayerById(pick.externalPlayerId)}
                          disabled={isWorking}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <View style={{ marginRight: 8, marginBottom: 8 }}>
                      <Button
                        title="Edit"
                        onPress={() => startEditingPick(pick)}
                      />
                    </View>
                    <View style={{ marginRight: 8, marginBottom: 8 }}>
                      <Button
                        title={isWorking ? "Deleting..." : "Delete"}
                        onPress={() => void handleDeletePick(pick)}
                        disabled={isWorking}
                      />
                    </View>
                    <View style={{ marginBottom: 8 }}>
                      <Button
                        title="Open"
                        onPress={() => openPlayerById(pick.externalPlayerId)}
                        disabled={isWorking}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}