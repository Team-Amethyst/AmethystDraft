import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getPlayers, getPlayersCached } from "../../api/players";
import {
  addRosterEntry,
  getRoster,
  getRosterCached,
  removeRosterEntry,
  updateRosterEntry,
  type RosterEntry,
} from "../../api/roster";
import AppButton from "../ui/AppButton";
import AppCard from "../ui/AppCard";
import AppChip from "../ui/AppChip";
import AppTextInput from "../ui/AppTextInput";
import { EmptyState, ErrorState, LoadingState } from "../ui/ScreenState";
import { colors } from "../../theme/colors";
import type { Player } from "../../types/player";
import { getEligibleSlotsForPositions } from "../../utils/eligibility";
import { ROSTER_SLOT_ORDER } from "../../domain/leagueForm";

type KeeperEditorLeague = {
  id?: string;
  teams: number;
  teamNames?: string[];
  rosterSlots: Record<string, number>;
  posEligibilityThreshold?: number;
  playerPool?: "Mixed" | "AL" | "NL";
};

export type DraftKeeperEntry = {
  id: string;
  teamId: string;
  externalPlayerId: string;
  playerName: string;
  playerTeam: string;
  positions: string[];
  price: number;
  rosterSlot: string;
  keeperContract?: string;
};

type Props = {
  mode: "draft" | "persisted";
  league: KeeperEditorLeague;
  leagueId?: string;
  token?: string | null;
  userId?: string;
  draftKeepers?: DraftKeeperEntry[];
  onDraftKeepersChange?: (keepers: DraftKeeperEntry[]) => void;
  showIntro?: boolean;
};

function teamIdFromIndex(index: number): string {
  return `team_${index + 1}`;
}

function safeTeamNames(teams: number, names?: string[]): string[] {
  return Array.from({ length: Math.max(1, teams) }, (_, index) => {
    return names?.[index]?.trim() || `Team ${index + 1}`;
  });
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

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function playerRecord(player: Player): Record<string, unknown> {
  return player as unknown as Record<string, unknown>;
}

function getPlayerImageUrl(player: Player): string | null {
  const record = playerRecord(player);
  const direct =
    record.headshotUrl ??
    record.imageUrl ??
    record.photoUrl ??
    record.playerImageUrl ??
    record.headshot ??
    player.headshot;

  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const mlbId =
    finiteNumber(record.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId) ??
    finiteNumber(player.mlbId);

  if (mlbId === null) return null;

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:best/v1/people/${Math.round(
    mlbId,
  )}/headshot/67/current`;
}

function displayPosition(player: Player): string {
  if (player.positions?.length) {
    return player.positions.join("/");
  }

  return player.position || "—";
}

function playerPositions(player: Player): string[] {
  const positions = player.positions?.length
    ? player.positions
    : player.position.split(/[\/|,]/).map((item) => item.trim()).filter(Boolean);

  return positions.length > 0 ? positions : [player.position || "UTIL"];
}

function rosterSlotNames(rosterSlots: Record<string, number>): string[] {
  return [
    ...ROSTER_SLOT_ORDER.filter((slot) => (rosterSlots[slot] ?? 0) > 0),
    ...Object.keys(rosterSlots).filter(
      (slot) => !ROSTER_SLOT_ORDER.includes(slot) && (rosterSlots[slot] ?? 0) > 0,
    ),
  ];
}

function eligibleSlotsForPlayer(player: Player | null, allSlots: string[]): string[] {
  if (!player) return allSlots;

  const eligible = getEligibleSlotsForPositions(
    player.positions,
    allSlots,
    player.position,
  );

  return eligible.length > 0 ? eligible : allSlots;
}

function playerMatchesQuery(player: Player, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    player.name,
    player.team,
    player.position,
    ...(player.positions ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function sortPlayersForKeeperSearch(a: Player, b: Player): number {
  const rankA = finiteNumber(playerRecord(a).catalog_rank) ?? finiteNumber(a.adp) ?? 9999;
  const rankB = finiteNumber(playerRecord(b).catalog_rank) ?? finiteNumber(b.adp) ?? 9999;

  if (rankA !== rankB) return rankA - rankB;
  return a.name.localeCompare(b.name);
}

function PosBadge({ label }: { label: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#5b3a89",
        backgroundColor: "#271a3d",
        borderRadius: 7,
        paddingHorizontal: 7,
        paddingVertical: 3,
        marginRight: 5,
        marginBottom: 4,
      }}
    >
      <Text style={{ color: "#ddd6fe", fontWeight: "900", fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function MiniPlayerRow({
  player,
  selected,
  onPress,
}: {
  player: Player;
  selected: boolean;
  onPress: () => void;
}) {
  const imageUrl = getPlayerImageUrl(player);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: 11,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: selected ? "#221735" : "transparent",
      }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.surface2,
            marginRight: 10,
          }}
        />
      ) : (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.surface2,
            marginRight: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.purple2, fontWeight: "900" }}>
            {player.name.slice(0, 1)}
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>
          {player.name}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 2 }}>
          {player.team || "FA"} • {displayPosition(player)} • Rank {Math.round(player.adp ?? 999)}
        </Text>
      </View>

      <Text style={{ color: colors.purple2, fontWeight: "900", marginLeft: 8 }}>
        {selected ? "Selected" : "Pick"}
      </Text>
    </TouchableOpacity>
  );
}

export default function LeagueKeeperEditor({
  mode,
  league,
  leagueId,
  token,
  userId,
  draftKeepers = [],
  onDraftKeepersChange,
  showIntro = true,
}: Props) {
  const teamNames = useMemo(
    () => safeTeamNames(league.teams, league.teamNames),
    [league.teams, league.teamNames],
  );

  const allSlots = useMemo(
    () => rosterSlotNames(league.rosterSlots),
    [league.rosterSlots],
  );

  const [players, setPlayers] = useState<Player[]>(
    () =>
      getPlayersCached(
        "catalog_rank",
        league.posEligibilityThreshold,
        league.playerPool,
      ) ?? [],
  );
  const [persistedKeepers, setPersistedKeepers] = useState<RosterEntry[]>(
    () => (mode === "persisted" && leagueId ? getRosterCached(leagueId)?.filter((entry) => entry.isKeeper) ?? [] : []),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("team_1");
  const [query, setQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [slot, setSlot] = useState("");
  const [costRaw, setCostRaw] = useState("1");
  const [contract, setContract] = useState("");
  const [editRows, setEditRows] = useState<Record<string, { slot: string; cost: string; contract: string }>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const nextPlayers = await getPlayers(
        "catalog_rank",
        league.posEligibilityThreshold,
        league.playerPool,
      );
      setPlayers(nextPlayers);

      if (mode === "persisted" && leagueId && token) {
        const roster = await getRoster(leagueId, token);
        setPersistedKeepers(roster.filter((entry) => entry.isKeeper));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keeper data.");
    } finally {
      setLoading(false);
    }
  }, [league.posEligibilityThreshold, league.playerPool, leagueId, mode, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedPlayer && !slot) {
      const eligible = eligibleSlotsForPlayer(selectedPlayer, allSlots);
      setSlot(eligible[0] ?? "BN");
    }
  }, [selectedPlayer, allSlots, slot]);

  const activeKeepers = mode === "draft" ? draftKeepers : persistedKeepers;

  const takenIds = useMemo(() => {
    return new Set(activeKeepers.map((entry) => entry.externalPlayerId));
  }, [activeKeepers]);

  const filteredPlayers = useMemo(() => {
    return players
      .filter((player) => !takenIds.has(player.id))
      .filter((player) => playerMatchesQuery(player, query))
      .sort(sortPlayersForKeeperSearch)
      .slice(0, query.trim() ? 30 : 12);
  }, [players, query, takenIds]);

  const selectedEligibleSlots = eligibleSlotsForPlayer(selectedPlayer, allSlots);

  const teamKeepers = activeKeepers.filter((entry) => entry.teamId === selectedTeamId);

  function resetAddForm() {
    setSelectedPlayer(null);
    setSlot("");
    setCostRaw("1");
    setContract("");
  }

  async function handleAddKeeper() {
    if (!selectedPlayer) {
      Alert.alert("Select player", "Choose a player from the available list first.");
      return;
    }

    const price = Number.parseInt(costRaw, 10);

    if (!Number.isFinite(price) || price < 0) {
      Alert.alert("Invalid cost", "Keeper cost must be a non-negative number.");
      return;
    }

    const cleanSlot = (slot || selectedEligibleSlots[0] || "BN").trim().toUpperCase();
    const payload = {
      externalPlayerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      playerTeam: selectedPlayer.team,
      positions: playerPositions(selectedPlayer),
      price,
      rosterSlot: cleanSlot,
      isKeeper: true,
      keeperContract: contract.trim() || undefined,
      userId,
      teamId: selectedTeamId,
    };

    if (mode === "draft") {
      onDraftKeepersChange?.([
        ...draftKeepers,
        {
          id: `keeper:${selectedPlayer.id}:${selectedTeamId}:${Date.now()}`,
          teamId: selectedTeamId,
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: playerPositions(selectedPlayer),
          price,
          rosterSlot: cleanSlot,
          keeperContract: contract.trim() || undefined,
        },
      ]);
      resetAddForm();
      return;
    }

    if (!leagueId || !token) return;

    setSaving(true);
    try {
      const entry = await addRosterEntry(leagueId, payload, token);
      setPersistedKeepers((current) => [...current, entry]);
      resetAddForm();
    } catch (err) {
      Alert.alert(
        "Could not add keeper",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKeeper(entry: DraftKeeperEntry | RosterEntry) {
    if (mode === "draft") {
      onDraftKeepersChange?.(
        draftKeepers.filter((item) => item.id !== (entry as DraftKeeperEntry).id),
      );
      return;
    }

    if (!leagueId || !token || !("_id" in entry)) return;

    setSaving(true);
    try {
      await removeRosterEntry(leagueId, entry._id, token);
      setPersistedKeepers((current) => current.filter((item) => item._id !== entry._id));
    } catch (err) {
      Alert.alert(
        "Could not remove keeper",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  function getEdit(entry: RosterEntry) {
    return editRows[entry._id] ?? {
      slot: entry.rosterSlot,
      cost: String(entry.price),
      contract: entry.keeperContract ?? "",
    };
  }

  function updateEdit(entryId: string, patch: Partial<{ slot: string; cost: string; contract: string }>) {
    setEditRows((current) => {
      const entry = persistedKeepers.find((item) => item._id === entryId);
      if (!entry) return current;

      return {
        ...current,
        [entryId]: {
          ...getEdit(entry),
          ...patch,
        },
      };
    });
  }

  async function handleSaveKeeperEdit(entry: RosterEntry) {
    if (!leagueId || !token) return;

    const edit = getEdit(entry);
    const price = Number.parseInt(edit.cost, 10);

    if (!Number.isFinite(price) || price < 0) {
      Alert.alert("Invalid cost", "Keeper cost must be a non-negative number.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateRosterEntry(
        leagueId,
        entry._id,
        {
          price,
          rosterSlot: edit.slot.trim().toUpperCase() || entry.rosterSlot,
          keeperContract: edit.contract.trim() || undefined,
        },
        token,
      );
      setPersistedKeepers((current) => current.map((item) => (item._id === entry._id ? updated : item)));
      setEditRows((current) => {
        const next = { ...current };
        delete next[entry._id];
        return next;
      });
    } catch (err) {
      Alert.alert(
        "Could not save keeper",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      {showIntro ? (
        <Text style={{ color: colors.muted, marginBottom: 12 }}>
          Pick a team tab, search the player catalog, then assign keeper cost,
          contract, and roster slot.
        </Text>
      ) : null}

      {error ? <ErrorState label={error} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {teamNames.map((teamName, index) => {
          const teamId = teamIdFromIndex(index);
          const count = activeKeepers.filter((entry) => entry.teamId === teamId).length;

          return (
            <AppChip
              key={teamId}
              label={`${teamName}${count > 0 ? ` (${count})` : ""}`}
              selected={selectedTeamId === teamId}
              onPress={() => setSelectedTeamId(teamId)}
              style={{ marginRight: 8 }}
            />
          );
        })}
      </ScrollView>

      {loading ? <LoadingState label="Loading keeper player pool..." /> : null}

      <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
        <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 10 }}>
          1. AVAILABLE PLAYERS
        </Text>

        <AppTextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
          containerStyle={{ marginBottom: 8 }}
        />

        {filteredPlayers.length === 0 ? (
          <EmptyState label={query.trim() ? "No matching available players." : "Start typing or use the top catalog list."} />
        ) : (
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {filteredPlayers.map((player) => (
              <MiniPlayerRow
                key={player.id}
                player={player}
                selected={selectedPlayer?.id === player.id}
                onPress={() => {
                  setSelectedPlayer(player);
                  const eligible = eligibleSlotsForPlayer(player, allSlots);
                  setSlot(eligible[0] ?? "BN");
                  setCostRaw(String(Math.max(1, Math.round(player.value ?? 1))));
                }}
              />
            ))}
          </View>
        )}
      </AppCard>

      {selectedPlayer ? (
        <AppCard backgroundColor="#151021" borderColor="#3f2a5f">
          <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }}>
            ADD KEEPER
          </Text>

          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
            {selectedPlayer.name}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 3, marginBottom: 8 }}>
            {selectedPlayer.team || "FA"} • {displayPosition(selectedPlayer)}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
            {selectedEligibleSlots.map((item) => (
              <AppChip
                key={item}
                label={item}
                selected={slot === item}
                onPress={() => setSlot(item)}
                style={{ marginRight: 7, marginBottom: 7 }}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppTextInput
                label="Paid"
                value={costRaw}
                onChangeText={setCostRaw}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput
                label="Contract"
                value={contract}
                onChangeText={setContract}
                placeholder="3Y / Arb"
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                title={saving ? "Adding..." : "Add Keeper"}
                loading={saving}
                disabled={saving}
                onPress={() => void handleAddKeeper()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title="Cancel" variant="secondary" onPress={resetAddForm} />
            </View>
          </View>
        </AppCard>
      ) : null}

      <AppCard backgroundColor="#0f0a18" borderColor="#25173b">
        <Text style={{ color: colors.purple2, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 10 }}>
          2. KEEPER ROSTER
        </Text>

        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 4 }}>
          {teamNameFromId(selectedTeamId, teamNames)}
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 10 }}>
          {teamKeepers.length} keeper{teamKeepers.length === 1 ? "" : "s"} assigned
        </Text>

        {teamKeepers.length === 0 ? (
          <EmptyState label="No keepers assigned for this team yet." />
        ) : (
          teamKeepers.map((entry, index) => {
            const key = "_id" in entry ? entry._id : entry.id;
            const isPersisted = "_id" in entry;
            const edit = isPersisted ? getEdit(entry as RosterEntry) : null;
            const positions = "positions" in entry ? entry.positions ?? [] : [];

            return (
              <View
                key={key}
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>
                  {entry.playerName}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {entry.playerTeam || "FA"} • {(positions.length ? positions : [entry.rosterSlot]).join("/")}
                </Text>

                {isPersisted && edit ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <AppTextInput
                          label="Paid"
                          value={edit.cost}
                          onChangeText={(value) => updateEdit((entry as RosterEntry)._id, { cost: value })}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppTextInput
                          label="Contract"
                          value={edit.contract}
                          onChangeText={(value) => updateEdit((entry as RosterEntry)._id, { contract: value })}
                          placeholder="3Y / Arb"
                        />
                      </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      {allSlots.map((item) => (
                        <AppChip
                          key={`${key}-${item}`}
                          label={item}
                          selected={edit.slot === item}
                          onPress={() => updateEdit((entry as RosterEntry)._id, { slot: item })}
                          style={{ marginRight: 7 }}
                        />
                      ))}
                    </ScrollView>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <AppButton
                          title="Save"
                          variant="secondary"
                          loading={saving}
                          disabled={saving}
                          onPress={() => void handleSaveKeeperEdit(entry as RosterEntry)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppButton
                          title="Remove"
                          variant="danger"
                          disabled={saving}
                          onPress={() => void handleRemoveKeeper(entry)}
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                      <PosBadge label={entry.rosterSlot} />
                      <PosBadge label={formatMoney(entry.price)} />
                      {entry.keeperContract ? <PosBadge label={entry.keeperContract} /> : null}
                    </View>
                    <View style={{ marginTop: 8 }}>
                      <AppButton
                        title="Remove"
                        variant="danger"
                        onPress={() => void handleRemoveKeeper(entry)}
                      />
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
      </AppCard>
    </View>
  );
}
