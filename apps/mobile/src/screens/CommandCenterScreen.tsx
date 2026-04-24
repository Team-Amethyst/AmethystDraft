import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { getPlayers } from "../api/players";
import { getRoster, type RosterEntry } from "../api/roster";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { Player } from "../types/player";
import { computeTeamData } from "../utils/commandCenterUtils";

export default function CommandCenterScreen({ route }: any) {
  const { leagueId } = route.params;
  const { token } = useAuth();
  const { allLeagues } = useLeague();
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { getNote, loadNotes, setNote } = usePlayerNotes();

  const [players, setPlayers] = useState<Player[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
            <Text style={{ marginTop: 8, marginBottom: 6, fontWeight: "600" }}>
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
      </ScrollView>
    </SafeAreaView>
  );
}