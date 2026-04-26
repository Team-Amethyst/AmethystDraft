import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getNewsSignals,
  getScarcity,
  type ScarcityResponse,
} from "../api/engine";
import { getPlayers } from "../api/players";
import {
  addRosterEntry,
  getRoster,
  type RosterEntry,
} from "../api/roster";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { Player } from "../types/player";
import { computeTeamData } from "../utils/commandCenterUtils";

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

export default function CommandCenterScreen({ route }: any) {
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

  const [engineScarcity, setEngineScarcity] = useState<ScarcityResponse | null>(
    null,
  );
  const [newsStrip, setNewsStrip] = useState<string | null>(null);

  const league = allLeagues.find((item) => item.id === leagueId);

  useEffect(() => {
    async function loadData() {
      if (!token || !league) return;

      try {
        const [playerData, rosterData] = await Promise.all([
          getPlayers("adp", league.posEligibilityThreshold, league.playerPool),
          getRoster(leagueId, token),
          loadNotes(leagueId),
        ]);

        setPlayers(playerData);
        setRoster(rosterData);
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
      .slice(0, 10);
  }, [roster]);

  async function refreshRoster() {
    if (!token) return;
    const rosterData = await getRoster(leagueId, token);
    setRoster(rosterData);
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

      await refreshRoster();
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
              Notes
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
          recentPicks.map((pick) => (
            <View
              key={pick._id}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#eee",
              }}
            >
              <Text style={{ fontWeight: "600" }}>{pick.playerName}</Text>
              <Text>
                {pick.teamId.replace("_", " ")} • {pick.rosterSlot} • ${pick.price}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}