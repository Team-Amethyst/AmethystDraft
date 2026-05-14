import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { getPlayers, getPlayersCached } from "../api/players";
import { getRoster, getRosterCached, type RosterEntry } from "../api/roster";
import AppCard from "../components/ui/AppCard";
import { EmptyState, ErrorState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import {
  addPlayerToTaxiRoster,
  initializeTaxiDraftOrder,
  moveTaxiDraftOrderTeamDown,
  moveTaxiDraftOrderTeamUp,
  removePlayerFromTaxiRoster,
  searchRankedEligibleTaxiPlayers,
} from "../domain/taxiDraft";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import type { TaxiRosters } from "../types/taxiDraft";
import {
  clearTaxiDraftState,
  loadTaxiDraftState,
  saveTaxiDraftOrder,
  saveTaxiRosters,
} from "../utils/taxiDraftPersistence";

type Props = BottomTabScreenProps<LeagueTabParamList, "TaxiDraft">;

function teamIdFromIndex(index: number): string {
  return index.toString();
}

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  if (teamNames && teamNames.length > 0) {
    return teamNames.slice(0, teams);
  }

  return Array.from({ length: teams }, (_, index) => `Team ${index + 1}`);
}

function totalTaxiPlayers(taxiRosters: TaxiRosters): number {
  let total = 0;

  for (const entries of Object.values(taxiRosters)) {
    total += entries.length;
  }

  return total;
}

export default function TaxiDraftScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const leagueTeamNames = useMemo(() => {
    if (!league) return [];
    return safeTeamNames(league.teams, league.teamNames);
  }, [league]);

  const [taxiDraftOrder, setTaxiDraftOrder] = useState<string[]>([]);
  const [taxiRosters, setTaxiRosters] = useState<TaxiRosters>({});
  const [activeTeamId, setActiveTeamId] = useState("0");
  const [searchQuery, setSearchQuery] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>(
    () => getRosterCached(leagueId) ?? [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const loadTaxiState = useCallback(async () => {
    if (!league) {
      setTaxiDraftOrder([]);
      setTaxiRosters({});
      setStorageReady(true);
      return;
    }

    const saved = await loadTaxiDraftState(league.id, token);

    if (saved?.taxiDraftOrder?.length) {
      setTaxiDraftOrder(saved.taxiDraftOrder);
    } else {
      setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
    }

    if (saved?.taxiRosters) {
      setTaxiRosters(saved.taxiRosters);
    } else {
      setTaxiRosters({});
    }

    setStorageReady(true);
  }, [league, leagueTeamNames, token]);

  const loadData = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!league || !token) return;

      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const cachedPlayers = getPlayersCached(
        "catalog_rank",
        league.posEligibilityThreshold,
        league.playerPool,
      );

      if (cachedPlayers) {
        setPlayers(cachedPlayers);
      }

      const cachedRoster = getRosterCached(league.id);

      if (cachedRoster) {
        setRosterEntries(cachedRoster);
      }

      try {
        const [playersFromApi, rosterFromApi] = await Promise.all([
          getPlayers(
            "catalog_rank",
            league.posEligibilityThreshold,
            league.playerPool,
          ),
          getRoster(league.id, token),
        ]);

        setPlayers(playersFromApi);
        setRosterEntries(rosterFromApi);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Taxi Draft");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [league, token],
  );

  useEffect(() => {
    setStorageReady(false);
    void loadTaxiState();
  }, [loadTaxiState]);

  useEffect(() => {
    void loadData("load");
  }, [loadData]);

  useEffect(() => {
    if (!league || !storageReady) return;

    setSaveStatus("saving");

    void saveTaxiDraftOrder(league.id, taxiDraftOrder, token).then(() => {
      setSaveStatus("saved");
    });
  }, [league, storageReady, taxiDraftOrder, token]);

  useEffect(() => {
    if (!league || !storageReady) return;

    setSaveStatus("saving");

    void saveTaxiRosters(league.id, taxiRosters, token).then(() => {
      setSaveStatus("saved");
    });
  }, [league, storageReady, taxiRosters, token]);

  useEffect(() => {
    if (leagueTeamNames.length === 0) {
      setActiveTeamId("");
      return;
    }

    setActiveTeamId((previous) => {
      const parsed = Number.parseInt(previous, 10);

      if (
        Number.isFinite(parsed) &&
        parsed >= 0 &&
        parsed < leagueTeamNames.length
      ) {
        return previous;
      }

      return "0";
    });
  }, [leagueTeamNames.length]);

  const draftedIds = useMemo(
    () => rosterEntries.map((entry) => entry.externalPlayerId),
    [rosterEntries],
  );

  const searchResults = useMemo(() => {
    return searchRankedEligibleTaxiPlayers(
      players,
      searchQuery,
      draftedIds,
      taxiRosters,
      { limit: 12 },
    );
  }, [players, searchQuery, draftedIds, taxiRosters]);

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();

    for (const player of players) {
      map.set(player.id, player);
    }

    return map;
  }, [players]);

  function handleAddPlayer(player: Player) {
    if (!activeTeamId) return;

    const pickNumber = totalTaxiPlayers(taxiRosters) + 1;

    setTaxiRosters((current) =>
      addPlayerToTaxiRoster(
        current,
        activeTeamId,
        player.id,
        new Date().toISOString(),
        pickNumber,
      ),
    );

    setSearchQuery("");
  }

  function handleRemovePlayer(teamId: string, playerId: string) {
    setTaxiRosters((current) =>
      removePlayerFromTaxiRoster(current, teamId, playerId),
    );
  }

  function handleResetOrder() {
    setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
  }

  function handleReverseOrder() {
    setTaxiDraftOrder((current) => [...current].reverse());
  }

  async function handleRefresh() {
    await loadTaxiState();
    await loadData("refresh");
  }

  async function handleClearTaxiDraft() {
    if (!league) return;

    Alert.alert(
      "Clear Taxi Draft?",
      "This clears the saved taxi draft order and all taxi rosters for this league.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
            setTaxiRosters({});
            void clearTaxiDraftState(league.id);
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

  const activeTeamIndex = Number.parseInt(activeTeamId, 10);
  const activeTeamName =
    Number.isFinite(activeTeamIndex) && activeTeamIndex >= 0
      ? leagueTeamNames[activeTeamIndex] ?? "Team"
      : "Team";

  const activeRoster = taxiRosters[activeTeamId] ?? [];
  const totalTaxiCount = totalTaxiPlayers(taxiRosters);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 4 }}>
          Taxi Draft
        </Text>

        <Text style={{ color: "#4b5563", marginBottom: 8 }}>
          Set taxi order, search eligible players, and manage taxi rosters.
        </Text>

        <Text style={{ color: "#6b7280", marginBottom: 16 }}>
          {totalTaxiCount} total taxi player{totalTaxiCount === 1 ? "" : "s"} •{" "}
          {saveStatus === "saving"
            ? "Saving..."
            : saveStatus === "saved"
              ? "Saved"
              : "Ready"}
        </Text>

        {error ? <ErrorState label={error} /> : null}

        {loading ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator />
          </View>
        ) : null}

        <AppCard>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
            Taxi Draft Order
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
            <View style={{ marginRight: 8, marginBottom: 8 }}>
              <Button title="Reset" onPress={handleResetOrder} />
            </View>

            <View style={{ marginRight: 8, marginBottom: 8 }}>
              <Button title="Reverse" onPress={handleReverseOrder} />
            </View>

            <View style={{ marginBottom: 8 }}>
              <Button
                title="Clear"
                color="#b91c1c"
                onPress={() => void handleClearTaxiDraft()}
              />
            </View>
          </View>

          {taxiDraftOrder.length === 0 ? (
            <Text style={{ color: "#6b7280" }}>No teams available.</Text>
          ) : (
            taxiDraftOrder.map((teamName, index) => (
              <View
                key={`${teamName}-${index}`}
                style={{
                  paddingVertical: 10,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#e5e7eb",
                }}
              >
                <Text style={{ fontWeight: "700" }}>
                  {index + 1}. {teamName}
                </Text>

                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <View style={{ marginRight: 8 }}>
                    <Button
                      title="Up"
                      disabled={index === 0}
                      onPress={() =>
                        setTaxiDraftOrder((current) =>
                          moveTaxiDraftOrderTeamUp(current, teamName),
                        )
                      }
                    />
                  </View>

                  <Button
                    title="Down"
                    disabled={index === taxiDraftOrder.length - 1}
                    onPress={() =>
                      setTaxiDraftOrder((current) =>
                        moveTaxiDraftOrderTeamDown(current, teamName),
                      )
                    }
                  />
                </View>
              </View>
            ))
          )}
        </AppCard>

        <AppCard>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
            Add Taxi Player
          </Text>

          <Text style={{ color: "#4b5563", marginBottom: 8 }}>
            Selected team: {activeTeamName}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            {leagueTeamNames.map((teamName, index) => {
              const teamId = teamIdFromIndex(index);
              const selected = activeTeamId === teamId;
              const count = (taxiRosters[teamId] ?? []).length;

              return (
                <TouchableOpacity
                  key={teamId}
                  onPress={() => setActiveTeamId(teamId)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
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
                    {teamName} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            placeholder="Search player, team, or position..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: "#d1d5db",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
            }}
          />

          {searchQuery.trim().length > 0 && searchResults.length === 0 ? (
            <Text style={{ color: "#6b7280" }}>
              No eligible taxi players found.
            </Text>
          ) : null}

          {searchResults.map((player) => (
            <TouchableOpacity
              key={player.id}
              onPress={() => handleAddPlayer(player)}
              style={{
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: "#f1f5f9",
              }}
            >
              <Text style={{ fontWeight: "700" }}>{player.name}</Text>

              <Text style={{ color: "#4b5563", marginTop: 2 }}>
                {player.team} • {player.position} • ${player.value} • ADP{" "}
                {player.adp}
              </Text>
            </TouchableOpacity>
          ))}
        </AppCard>

        <AppCard>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>
            {activeTeamName} Taxi Roster
          </Text>

          <Text style={{ color: "#6b7280", marginBottom: 12 }}>
            {activeRoster.length} taxi player
            {activeRoster.length === 1 ? "" : "s"}
          </Text>

          {activeRoster.length === 0 ? (
            <EmptyState label="No taxi players for this team yet." />
          ) : (
            activeRoster.map((entry) => {
              const player = playerById.get(entry.playerId);

              return (
                <View
                  key={entry.playerId}
                  style={{
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderTopColor: "#f1f5f9",
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>
                    {player?.name ?? "Unknown player"}
                  </Text>

                  <Text style={{ color: "#4b5563", marginTop: 2 }}>
                    {player?.team ?? "Unknown"} •{" "}
                    {player?.position ?? "Unknown"}
                  </Text>

                  <Text style={{ color: "#6b7280", marginTop: 2 }}>
                    Pick #{entry.pickNumber ?? "—"} • Added{" "}
                    {new Date(entry.addedAt).toLocaleDateString()}
                  </Text>

                  <View style={{ marginTop: 8 }}>
                    <Button
                      title="Remove"
                      color="#b91c1c"
                      onPress={() =>
                        handleRemovePlayer(activeTeamId, entry.playerId)
                      }
                    />
                  </View>
                </View>
              );
            })
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}