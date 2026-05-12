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
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { getPlayers, getPlayersCached } from "../api/players";
import type { WatchlistPlayer } from "../api/watchlist";
import AppCard from "../components/ui/AppCard";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import { useMockDraft } from "../hooks/useMockDraft";
import type { LeagueTabParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import type { Player } from "../types/player";

type Props = BottomTabScreenProps<LeagueTabParamList, "MockDraft">;

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  if (teamNames && teamNames.length > 0) {
    return teamNames.slice(0, teams);
  }

  return Array.from({ length: teams }, (_, index) => `Team ${index + 1}`);
}

function watchlistToPlayer(p: WatchlistPlayer): Player {
  return {
    id: p.id,
    mlbId: 0,
    name: p.name,
    team: p.team,
    position: p.position,
    positions: p.positions,
    age: 0,
    adp: p.adp,
    value: p.value,
    tier: p.tier,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  };
}

function playerSearch(players: Player[], query: string): Player[] {
  const q = query.toLowerCase().trim();

  if (!q) return [];

  return players
    .filter((player) => player.name.toLowerCase().includes(q))
    .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
    .slice(0, 10);
}

export default function MockDraftScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();
  const { customPlayers } = useCustomPlayers();
  const { getWatchlistForLeague, loadWatchlist } = useWatchlist();

  const league = allLeagues.find((item) => item.id === leagueId) ?? null;

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [bidRaw, setBidRaw] = useState("2");

  const watchlist = getWatchlistForLeague(leagueId);

  const teamNames = useMemo(() => {
    if (!league) return [];
    return safeTeamNames(league.teams, league.teamNames);
  }, [league]);

  const watchlistPlayers = useMemo(
    () => watchlist.map(watchlistToPlayer),
    [watchlist],
  );

  const allPlayers = useMemo(
    () => [...customPlayers, ...players],
    [customPlayers, players],
  );

  const {
    state,
    storageLoaded,
    hasSavedDraft,
    startDraft,
    resetDraft,
    nominatePlayer,
    placeBid,
    keepBidding,
    confirmSell,
    currentTeamIdx,
    isUserTurn,
  } = useMockDraft(
    leagueId,
    teamNames,
    league?.budget ?? 260,
    league?.rosterSlots ?? {},
    allPlayers,
    watchlistPlayers,
  );

  const searchResults = useMemo(
    () => playerSearch(state.undraftedPlayers, searchQuery),
    [state.undraftedPlayers, searchQuery],
  );

  useEffect(() => {
    if (!token || !league) return;

    async function loadData() {
      if (!token || !league) return;

      setLoadingPlayers(true);
      setError("");

      const cached = getPlayersCached(
        "adp",
        league.posEligibilityThreshold,
        league.playerPool,
      );

      if (cached) setPlayers(cached);

      try {
        const result = await getPlayers(
          "adp",
          league.posEligibilityThreshold,
          league.playerPool,
        );

        setPlayers(result);
        await loadWatchlist(league.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load mock draft data.");
      } finally {
        setLoadingPlayers(false);
      }
    }

    void loadData();
  }, [token, league?.id]);

  function handleBid() {
    const amount = Number.parseInt(bidRaw, 10);

    if (!Number.isFinite(amount) || amount < 1) {
      Alert.alert("Invalid bid", "Enter a valid bid amount.");
      return;
    }

    placeBid(amount);
    setBidRaw(String(amount + 1));
  }

  function handleReset() {
    Alert.alert("Reset Mock Draft?", "This clears the saved mobile mock draft.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => void resetDraft(),
      },
    ]);
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  if (!storageLoaded || loadingPlayers) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <LoadingState label="Loading Mock Draft..." />
      </SafeAreaView>
    );
  }

  const currentTeam = state.rosters[currentTeamIdx];
  const userRoster = state.rosters.find((r) => r.isUser);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>
          AI Mock Draft
        </Text>

        <Text style={{ color: colors.muted, marginTop: 4, marginBottom: 16 }}>
          Practice auction strategy against AI-controlled teams.
        </Text>

        {error ? <ErrorState label={error} /> : null}

        {state.phase === "setup" ? (
          <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
              Mock Draft Setup
            </Text>

            <Text style={{ color: colors.muted, marginTop: 8 }}>
              Your team is {teamNames[0]}. The other {Math.max(0, teamNames.length - 1)} teams
              are AI-controlled.
            </Text>

            {hasSavedDraft ? (
              <Text style={{ color: colors.gold, marginTop: 10 }}>
                Saved draft found. It will resume automatically.
              </Text>
            ) : null}

            <View style={{ marginTop: 16 }}>
              <Button title="Start Mock Draft" onPress={startDraft} />
            </View>

            <View style={{ marginTop: 10 }}>
              <Button title="Reset Saved Draft" color="#b91c1c" onPress={handleReset} />
            </View>
          </AppCard>
        ) : null}

        {state.phase !== "setup" ? (
          <>
            <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Draft Status
              </Text>

              <Text style={{ color: colors.muted, marginTop: 8 }}>
                Phase: {state.phase}
              </Text>

              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Current team: {currentTeam?.teamName ?? "—"}
              </Text>

              <Text style={{ color: colors.gold, marginTop: 8 }}>
                {state.message || "Mock draft running."}
              </Text>

              <View style={{ marginTop: 12 }}>
                <Button title="Reset Draft" color="#b91c1c" onPress={handleReset} />
              </View>
            </AppCard>

            {state.phase === "nomination" && isUserTurn ? (
              <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  Your Nomination
                </Text>

                {state.suggestion ? (
                  <TouchableOpacity
                    onPress={() => nominatePlayer(state.suggestion!.player)}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.purple,
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 12,
                      backgroundColor: colors.surface2,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      Suggested: {state.suggestion.player.name}
                    </Text>
                    <Text style={{ color: colors.muted, marginTop: 4 }}>
                      {state.suggestion.reason}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TextInput
                  placeholder="Search player to nominate..."
                  placeholderTextColor={colors.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
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

                {searchResults.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    onPress={() => {
                      nominatePlayer(player);
                      setSearchQuery("");
                    }}
                    style={{
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {player.name}
                    </Text>
                    <Text style={{ color: colors.muted }}>
                      {player.team} • {player.position} • ${player.value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </AppCard>
            ) : null}

            {state.nominatedPlayer ? (
              <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                  On The Block
                </Text>

                <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 8 }}>
                  {state.nominatedPlayer.name}
                </Text>

                <Text style={{ color: colors.muted, marginTop: 4 }}>
                  {state.nominatedPlayer.team} • {state.nominatedPlayer.position} • Value $
                  {state.nominatedPlayer.value}
                </Text>

                <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "800", marginTop: 12 }}>
                  Current bid: ${state.currentBid} by {state.currentBidder}
                </Text>

                {state.phase === "bidding" ? (
                  <>
                    <TextInput
                      value={bidRaw}
                      onChangeText={setBidRaw}
                      keyboardType="number-pad"
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        color: colors.text,
                        borderRadius: 10,
                        padding: 12,
                        marginTop: 12,
                      }}
                    />

                    <View style={{ marginTop: 10 }}>
                      <Button title="Place Bid" onPress={handleBid} />
                    </View>
                  </>
                ) : null}

                {state.phase === "user-confirm" ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <Button title="Keep Bidding" onPress={keepBidding} />
                    <Button title="Sold / Confirm Winner" onPress={confirmSell} />
                  </View>
                ) : null}
              </AppCard>
            ) : null}

            <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Your Roster
              </Text>

              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Spent ${userRoster?.spent ?? 0} / ${league.budget}
              </Text>

              {(userRoster?.picks ?? []).length === 0 ? (
                <Text style={{ color: colors.muted, marginTop: 10 }}>
                  No picks yet.
                </Text>
              ) : (
                userRoster!.picks.map((pick, index) => (
                  <Text key={`${pick.player.id}-${index}`} style={{ color: colors.text, marginTop: 8 }}>
                    {pick.slot}: {pick.player.name} — ${pick.price}
                  </Text>
                ))
              )}
            </AppCard>

            <AppCard backgroundColor={colors.surface} borderColor={colors.border}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Draft Log
              </Text>

              {state.log.length === 0 ? (
                <Text style={{ color: colors.muted, marginTop: 10 }}>
                  No picks yet.
                </Text>
              ) : (
                [...state.log].reverse().slice(0, 20).map((entry) => (
                  <Text key={entry.pickNum} style={{ color: colors.text, marginTop: 8 }}>
                    #{entry.pickNum} {entry.player.name} → {entry.teamName} for ${entry.price}
                  </Text>
                ))
              )}
            </AppCard>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}