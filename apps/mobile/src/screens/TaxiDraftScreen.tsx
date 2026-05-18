import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
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
import { colors } from "../theme/colors";
import type { Player } from "../types/player";
import type { TaxiRosters } from "../types/taxiDraft";
import {
  clearTaxiDraftState,
  loadTaxiDraftState,
  saveTaxiDraftOrder,
  saveTaxiRosters,
} from "../utils/taxiDraftPersistence";

type Props = BottomTabScreenProps<LeagueTabParamList, "TaxiDraft">;

const positionColors: Record<string, string> = {
  C: "#ef4444",
  "1B": "#f59e0b",
  "2B": "#38bdf8",
  SS: "#22d3ee",
  "3B": "#f97316",
  MI: "#8b5cf6",
  CI: "#8b5cf6",
  OF: "#22c55e",
  LF: "#22c55e",
  CF: "#22c55e",
  RF: "#22c55e",
  UTIL: "#94a3b8",
  SP: "#818cf8",
  RP: "#ec4899",
  P: "#818cf8",
  BN: "#64748b",
  DH: "#a855f7",
};

function teamIdFromIndex(index: number): string {
  return index.toString();
}

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  const names = teamNames?.slice(0, teams) ?? [];

  while (names.length < teams) {
    names.push(`Team ${names.length + 1}`);
  }

  return names;
}

function totalTaxiPlayers(taxiRosters: TaxiRosters): number {
  let total = 0;

  for (const entries of Object.values(taxiRosters)) {
    total += entries.length;
  }

  return total;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString();
}

function formatMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "$0";
  }

  return `$${Math.round(value)}`;
}

function displayPositions(player: Player | undefined): string {
  if (!player) return "Unknown";

  const positions = player.positions?.length
    ? player.positions
    : [player.position];

  return positions.filter(Boolean).join(", ");
}

function primaryPosition(player: Player | undefined): string {
  if (!player) return "—";

  const positions = player.positions?.length
    ? player.positions
    : [player.position];

  return positions[0] ?? player.position ?? "—";
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.purple2,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 1.8,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function PositionBadge({ label }: { label: string }) {
  const normalized = label.toUpperCase();
  const color = positionColors[normalized] ?? colors.purple2;

  return (
    <View
      style={{
        minWidth: 42,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: `${color}22`,
        borderRadius: 7,
        paddingVertical: 4,
        paddingHorizontal: 8,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color,
          fontSize: 11,
          fontWeight: "900",
        }}
      >
        {normalized}
      </Text>
    </View>
  );
}

function PlayerAvatar({ player }: { player?: Player }) {
  const uri = player?.headshot?.trim();

  if (!uri) {
    return (
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: "#2a2140",
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        <Text style={{ color: colors.purple2, fontWeight: "900" }}>
          {(player?.name ?? "?").slice(0, 1)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#2a2140",
        marginRight: 10,
      }}
    />
  );
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

    setTaxiRosters(saved?.taxiRosters ?? {});
    setStorageReady(true);
  }, [league, leagueTeamNames, token]);

  const loadData = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!league || !token) {
        setLoading(false);
        return;
      }

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
    if (!league || !storageReady || taxiDraftOrder.length === 0) return;

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

  const totalTaxiCount = totalTaxiPlayers(taxiRosters);

  const activeTeamIndex = Number.parseInt(activeTeamId, 10);
  const activeTeamName =
    Number.isFinite(activeTeamIndex) && activeTeamIndex >= 0
      ? leagueTeamNames[activeTeamIndex] ?? "Team"
      : "Team";

  const activeRoster = taxiRosters[activeTeamId] ?? [];

  const isDefaultOrder =
    taxiDraftOrder.length > 0 &&
    taxiDraftOrder.every((team, index) => team === leagueTeamNames[index]);

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

  function handleClearTaxiDraft() {
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.purple2}
            onRefresh={() => void handleRefresh()}
          />
        }
      >
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingBottom: 14,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 26,
              fontWeight: "900",
              marginBottom: 6,
            }}
          >
            Taxi Draft
          </Text>

          <Text style={{ color: colors.purple2, lineHeight: 20 }}>
            Set taxi draft order, assign eligible players, and manage taxi rosters.
          </Text>

          <Text style={{ color: colors.muted, marginTop: 8 }}>
            {totalTaxiCount} total taxi player{totalTaxiCount === 1 ? "" : "s"} ·{" "}
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved"
                : "Ready"}
          </Text>
        </View>

        {error ? <ErrorState label={error} /> : null}

        {loading ? (
          <View style={{ paddingVertical: 18 }}>
            <ActivityIndicator color={colors.purple2} />
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 8 }}>
              Loading taxi draft...
            </Text>
          </View>
        ) : null}

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <SectionLabel>Taxi Draft Order</SectionLabel>

          <View
            style={{
              borderWidth: 1,
              borderColor: "#2d2444",
              backgroundColor: "#100c18",
              borderRadius: 14,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
              <AppButton
                title="Reset to League Order"
                variant="secondary"
                disabled={taxiDraftOrder.length === 0 || isDefaultOrder}
                style={{ marginRight: 8, marginBottom: 8 }}
                onPress={handleResetOrder}
              />

              <AppButton
                title="Reverse Order"
                variant="secondary"
                disabled={taxiDraftOrder.length === 0}
                style={{ marginRight: 8, marginBottom: 8 }}
                onPress={handleReverseOrder}
              />
            </View>

            {taxiDraftOrder.length === 0 ? (
              <Text style={{ color: colors.muted }}>No teams available.</Text>
            ) : (
              taxiDraftOrder.map((teamName, index) => (
                <View
                  key={`${teamName}-${index}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface2,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: colors.purple2,
                      width: 28,
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    {index + 1}
                  </Text>

                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.text,
                      flex: 1,
                      fontWeight: "900",
                      marginLeft: 8,
                    }}
                  >
                    {teamName}
                  </Text>

                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      disabled={index === 0}
                      onPress={() =>
                        setTaxiDraftOrder((current) =>
                          moveTaxiDraftOrderTeamUp(current, teamName),
                        )
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: index === 0 ? "#272033" : "#2a1845",
                        borderRadius: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        marginRight: 6,
                        opacity: index === 0 ? 0.55 : 1,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 12 }}>
                        UP
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.82}
                      disabled={index === taxiDraftOrder.length - 1}
                      onPress={() =>
                        setTaxiDraftOrder((current) =>
                          moveTaxiDraftOrderTeamDown(current, teamName),
                        )
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor:
                          index === taxiDraftOrder.length - 1 ? "#272033" : "#2a1845",
                        borderRadius: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        opacity: index === taxiDraftOrder.length - 1 ? 0.55 : 1,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 12 }}>
                        DOWN
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={handleClearTaxiDraft}
              style={{
                borderWidth: 1,
                borderColor: "#7f1d1d",
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginTop: 4,
                alignItems: "center",
                backgroundColor: "#2a1218",
              }}
            >
              <Text style={{ color: "#fecaca", fontWeight: "900" }}>
                Clear Taxi Draft Data
              </Text>
            </TouchableOpacity>
          </View>
        </AppCard>

        <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
          <SectionLabel>Roster Workspace</SectionLabel>

          <Text style={{ color: colors.purple2, lineHeight: 20, marginBottom: 12 }}>
            Pick a team, use the same player search as Command Center, then add.
            The list below shows only that team’s taxi squad.
          </Text>

          <View
            style={{
              borderWidth: 1,
              borderColor: "#211936",
              backgroundColor: "#090712",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 10,
            }}
          >
            <TextInput
              placeholder="Search player to add to taxi roster..."
              placeholderTextColor="#6f647f"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              style={{
                color: colors.text,
                fontSize: 14,
                minHeight: 38,
              }}
            />
          </View>

          {searchQuery.trim().length > 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                backgroundColor: "#100c18",
                marginBottom: 12,
                overflow: "hidden",
              }}
            >
              {searchResults.length === 0 ? (
                <Text style={{ color: colors.muted, padding: 12 }}>
                  No eligible taxi players found.
                </Text>
              ) : (
                searchResults.map((player, index) => (
                  <TouchableOpacity
                    key={player.id}
                    activeOpacity={0.84}
                    onPress={() => handleAddPlayer(player)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <PlayerAvatar player={player} />

                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.text, fontWeight: "900" }}
                      >
                        {player.name}
                      </Text>

                      <Text style={{ color: colors.muted, marginTop: 3 }}>
                        {player.team} · {displayPositions(player)} · ADP{" "}
                        {player.adp ?? "—"}
                      </Text>
                    </View>

                    <Text style={{ color: colors.gold, fontWeight: "900" }}>
                      {formatMoney(player.value)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : null}

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
                <AppChip
                  key={teamId}
                  label={`${teamName}  ${count}`}
                  selected={selected}
                  onPress={() => setActiveTeamId(teamId)}
                  style={{ marginRight: 8 }}
                />
              );
            })}
          </ScrollView>

          <View
            style={{
              borderWidth: 1,
              borderColor: "#2d2444",
              backgroundColor: "#100c18",
              borderRadius: 14,
              padding: 12,
              minHeight: 180,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "900",
                }}
              >
                {activeTeamName}
              </Text>

              <Text style={{ color: colors.purple2, fontWeight: "800" }}>
                {activeRoster.length} taxi player
                {activeRoster.length === 1 ? "" : "s"}
              </Text>
            </View>

            {activeRoster.length === 0 ? (
              <EmptyState label="No taxi players for this team yet. Select the tab and search above to add one." />
            ) : (
              activeRoster.map((entry, index) => {
                const player = playerById.get(entry.playerId);
                const pos = primaryPosition(player);

                return (
                  <View
                    key={entry.playerId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <PlayerAvatar player={player} />

                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.text,
                          fontWeight: "900",
                          marginBottom: 4,
                        }}
                      >
                        {player?.name ?? "Unknown player"}
                      </Text>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <Text style={{ color: colors.muted, marginRight: 8 }}>
                          {player?.team ?? "Unknown"}
                        </Text>

                        <PositionBadge label={pos} />
                      </View>

                      <Text style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>
                        {entry.pickNumber != null ? `Pick #${entry.pickNumber} · ` : ""}
                        Added {formatDate(entry.addedAt)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => handleRemovePlayer(activeTeamId, entry.playerId)}
                      style={{
                        borderWidth: 1,
                        borderColor: "#7f1d1d",
                        backgroundColor: "#2a1218",
                        borderRadius: 9,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text style={{ color: "#fecaca", fontWeight: "900", fontSize: 12 }}>
                        REMOVE
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}