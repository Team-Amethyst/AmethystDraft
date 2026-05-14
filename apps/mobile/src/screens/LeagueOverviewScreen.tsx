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
import { getPlayers, getPlayersCached } from "../api/players";
import {
  getRoster,
  getRosterCached,
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
import { colors } from "../theme/colors";
import type { Player } from "../types/player";

type Props = BottomTabScreenProps<LeagueTabParamList, "Overview">;

type EntryEdit = {
  price: string;
  rosterSlot: string;
  teamId: string;
  keeperContract: string;
};

type SlotRow = {
  position: string;
  playerName: string | null;
  playerTeam: string | null;
  price: number | null;
  isKeeper: boolean;
  keeperContract?: string;
};

type TeamCardData = {
  teamId: string;
  teamName: string;
  slots: SlotRow[];
  rosterFilled: number;
  rosterTotal: number;
  spent: number;
  budgetRemaining: number;
  bidAvg: number;
  maxBid: number;
};

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

type StandingRow = {
  teamName: string;
  stats: Record<string, number>;
};

const SLOT_ORDER = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "CI",
  "OF",
  "UTIL",
  "SP",
  "RP",
  "BN",
];

const FALLBACK_CATS: ScoringCategory[] = [
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
  { name: "W", type: "pitching" },
  { name: "SV", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
];

const LOWER_IS_BETTER = new Set(["ERA", "WHIP"]);

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

function safeTeamNames(teams: number, teamNames?: string[]): string[] {
  if (teamNames && teamNames.length > 0) {
    return teamNames.slice(0, teams);
  }

  return Array.from({ length: teams }, (_, index) => `Team ${index + 1}`);
}

function formatMoney(value: number): string {
  return `$${Math.round(value)}`;
}

function normalizeCatName(name: string): string {
  return name.trim().toUpperCase();
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

function orderedRosterSlots(rosterSlots: Record<string, number>): string[] {
  return [
    ...SLOT_ORDER.filter((pos) => rosterSlots[pos] !== undefined),
    ...Object.keys(rosterSlots).filter((pos) => !SLOT_ORDER.includes(pos)),
  ];
}

function buildTeamCardData(
  teamIndex: number,
  teamName: string,
  rosterSlots: Record<string, number>,
  entries: RosterEntry[],
  budget: number,
): TeamCardData {
  const teamId = teamIdFromIndex(teamIndex);
  const teamEntries = entries.filter((entry) => entry.teamId === teamId);
  const orderedPositions = orderedRosterSlots(rosterSlots);
  const usedIds = new Set<string>();
  const slots: SlotRow[] = [];

  for (const position of orderedPositions) {
    const count = rosterSlots[position] ?? 0;
    const entriesAtSlot = teamEntries.filter(
      (entry) => entry.rosterSlot === position && !usedIds.has(entry._id),
    );

    for (let i = 0; i < count; i++) {
      const entry = entriesAtSlot[i];

      if (entry) {
        usedIds.add(entry._id);
      }

      slots.push({
        position,
        playerName: entry?.playerName ?? null,
        playerTeam: entry?.playerTeam ?? null,
        price: entry?.price ?? null,
        isKeeper: entry?.isKeeper ?? false,
        keeperContract: entry?.keeperContract,
      });
    }
  }

  const rosterFilled = slots.filter((slot) => slot.playerName !== null).length;
  const rosterTotal = slots.length;
  const spent = teamEntries.reduce((sum, entry) => sum + entry.price, 0);
  const budgetRemaining = budget - spent;
  const open = Math.max(0, rosterTotal - rosterFilled);

  return {
    teamId,
    teamName,
    slots,
    rosterFilled,
    rosterTotal,
    spent,
    budgetRemaining,
    bidAvg: open > 0 ? Math.round(budgetRemaining / open) : 0,
    maxBid: open > 0 ? Math.max(1, budgetRemaining - (open - 1)) : 0,
  };
}

function playerStat(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const cat = normalizeCatName(catName);
  const data = player as unknown as {
    stats?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
    projection?: {
      batting?: Record<string, unknown>;
      pitching?: Record<string, unknown>;
    };
  };

  const source =
    catType === "batting"
      ? data.projection?.batting ?? data.stats?.batting
      : data.projection?.pitching ?? data.stats?.pitching;

  if (!source) return 0;

  const aliases: Record<string, string[]> = {
    R: ["runs", "r"],
    HR: ["hr", "homeRuns"],
    RBI: ["rbi"],
    SB: ["sb", "stolenBases"],
    AVG: ["avg"],
    OBP: ["obp"],
    SLG: ["slg"],
    W: ["wins", "w"],
    K: ["strikeouts", "k", "so"],
    ERA: ["era"],
    WHIP: ["whip"],
    SV: ["saves", "sv"],
    HLD: ["holds", "hld"],
    IP: ["innings", "ip"],
  };

  const keys = aliases[cat] ?? [cat.toLowerCase()];

  for (const key of keys) {
    const raw = source[key];

    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === "string") {
      const parsed = Number(raw);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function buildProjectedStandings(
  teamNames: string[],
  entries: RosterEntry[],
  playerMap: Map<string, Player>,
  scoringCats: ScoringCategory[],
): StandingRow[] {
  return teamNames.map((teamName, index) => {
    const teamId = teamIdFromIndex(index);
    const teamPlayers = entries
      .filter((entry) => entry.teamId === teamId)
      .map((entry) => playerMap.get(entry.externalPlayerId))
      .filter((player): player is Player => Boolean(player));

    const stats: Record<string, number> = {};

    for (const cat of scoringCats) {
      const catName = normalizeCatName(cat.name);

      if (catName === "AVG" || catName === "OBP" || catName === "SLG") {
        const values = teamPlayers
          .map((player) => playerStat(player, catName, cat.type))
          .filter((value) => value > 0);

        stats[catName] =
          values.length > 0
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0;
      } else if (catName === "ERA" || catName === "WHIP") {
        const values = teamPlayers
          .map((player) => playerStat(player, catName, cat.type))
          .filter((value) => value > 0);

        stats[catName] =
          values.length > 0
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0;
      } else {
        stats[catName] = teamPlayers.reduce(
          (sum, player) => sum + playerStat(player, catName, cat.type),
          0,
        );
      }
    }

    return { teamName, stats };
  });
}

function formatStatCell(cat: string, value: number): string {
  if (value === 0) return "—";

  const normalized = normalizeCatName(cat);

  if (normalized === "AVG" || normalized === "OBP" || normalized === "SLG") {
    return value.toFixed(3);
  }

  if (normalized === "ERA" || normalized === "WHIP") {
    return value.toFixed(2);
  }

  return String(Math.round(value));
}

function rankForCategory(
  standings: StandingRow[],
  teamName: string,
  cat: string,
): number {
  const lowerIsBetter = LOWER_IS_BETTER.has(normalizeCatName(cat));

  const sorted = [...standings].sort((a, b) => {
    const av = a.stats[cat] ?? 0;
    const bv = b.stats[cat] ?? 0;

    if (lowerIsBetter) {
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return av - bv;
    }

    return bv - av;
  });

  return sorted.findIndex((row) => row.teamName === teamName) + 1;
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

  const [entries, setEntries] = useState<RosterEntry[]>(
    () => getRosterCached(leagueId) ?? [],
  );
  const [allPlayers, setAllPlayers] = useState<Player[]>(
    () =>
      getPlayersCached(
        "value",
        league?.posEligibilityThreshold,
        league?.playerPool,
      ) ?? [],
  );
  const [selectedTeamId, setSelectedTeamId] = useState("team_1");
  const [edits, setEdits] = useState<Record<string, EntryEdit>>({});
  const [sortCat, setSortCat] = useState("HR");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(() => getRosterCached(leagueId) === null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadOverview = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!token || !league) return;

      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const cachedRoster = getRosterCached(league.id);
      if (cachedRoster) setEntries(cachedRoster);

      const cachedPlayers = getPlayersCached(
        "value",
        league.posEligibilityThreshold,
        league.playerPool,
      );
      if (cachedPlayers) setAllPlayers(cachedPlayers);

      try {
        const [roster, players] = await Promise.all([
          getRoster(league.id, token),
          getPlayers("value", league.posEligibilityThreshold, league.playerPool),
        ]);

        setEntries(roster);
        setAllPlayers(players);
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
    void loadOverview("load");
  }, [loadOverview]);

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

  const rosterSlotOptions = useMemo(() => {
    return orderedRosterSlots(league?.rosterSlots ?? {});
  }, [league]);

  const teamCards = useMemo(() => {
    if (!league) return [];

    return teamNames.map((teamName, index) =>
      buildTeamCardData(
        index,
        teamName,
        league.rosterSlots ?? {},
        entries,
        league.budget,
      ),
    );
  }, [league, teamNames, entries]);

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
    return sortDraftLog(entries.filter((entry) => !entry.isKeeper));
  }, [entries]);

  const playerMap = useMemo(() => {
    return new Map(allPlayers.map((player) => [player.id, player]));
  }, [allPlayers]);

  const scoringCats = useMemo(() => {
    return (league?.scoringCategories?.length
      ? league.scoringCategories
      : FALLBACK_CATS
    ).map((cat) => ({
      name: normalizeCatName(cat.name),
      type: cat.type,
    }));
  }, [league]);

  const allCatNames = useMemo(() => {
    return scoringCats.map((cat) => cat.name);
  }, [scoringCats]);

  const standings = useMemo(() => {
    return buildProjectedStandings(teamNames, entries, playerMap, scoringCats);
  }, [teamNames, entries, playerMap, scoringCats]);

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      const av = a.stats[sortCat] ?? 0;
      const bv = b.stats[sortCat] ?? 0;
      const lowerIsBetter = LOWER_IS_BETTER.has(sortCat);
      const diff = lowerIsBetter ? av - bv : bv - av;

      return sortAsc ? -diff : diff;
    });
  }, [standings, sortCat, sortAsc]);

  function toggleSort(cat: string) {
    if (cat === sortCat) {
      setSortAsc((value) => !value);
    } else {
      setSortCat(cat);
      setSortAsc(false);
    }
  }

  function getEdit(entry: RosterEntry): EntryEdit {
    return (
      edits[entry._id] ?? {
        price: String(entry.price),
        rosterSlot: entry.rosterSlot,
        teamId: entry.teamId,
        keeperContract: entry.keeperContract ?? "",
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
          keeperContract: entry.keeperContract ?? "",
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
          keeperContract: edit.keeperContract.trim() || undefined,
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
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <EmptyState label="League not found." />
      </SafeAreaView>
    );
  }

  const selectedTeamName = teamNameFromId(selectedTeamId, teamNames);
  const selectedTeamSpent = teamSpent[selectedTeamId] ?? 0;
  const selectedTeamRemaining = league.budget - selectedTeamSpent;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadOverview("refresh")}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.text, marginBottom: 4 }}>
          League Overview
        </Text>

        <Text style={{ color: colors.muted, marginBottom: 16 }}>
          Track team budgets, projected standings, rosters, and the full draft log.
        </Text>

        {error ? <ErrorState label={error} /> : null}

        {loading ? (
          <LoadingState label="Loading league overview..." />
        ) : (
          <>
            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10 }}>
                League Summary
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Teams</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {league.teams}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Budget</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {formatMoney(league.budget)}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Players Drafted</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {entries.length}
                  </Text>
                </View>

                <View style={{ width: "50%", marginBottom: 12 }}>
                  <Text style={{ color: colors.muted }}>Total Spent</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>
                    {formatMoney(totalSpent)}
                  </Text>
                </View>
              </View>
            </AppCard>

            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10 }}>
                Team Comparison
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {teamCards.map((team) => (
                  <TouchableOpacity
                    key={team.teamId}
                    onPress={() => setSelectedTeamId(team.teamId)}
                    style={{
                      width: 270,
                      borderWidth: 1,
                      borderColor:
                        selectedTeamId === team.teamId ? colors.purple2 : colors.border,
                      borderRadius: 16,
                      padding: 12,
                      marginRight: 12,
                      backgroundColor:
                        selectedTeamId === team.teamId ? colors.surface2 : colors.surface,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
                      {team.teamName}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 3, marginBottom: 10 }}>
                      {team.rosterFilled}/{team.rosterTotal} filled
                    </Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      <Text style={{ color: colors.gold, marginRight: 12, marginBottom: 6 }}>
                        Left {formatMoney(team.budgetRemaining)}
                      </Text>
                      <Text style={{ color: colors.muted, marginRight: 12, marginBottom: 6 }}>
                        Avg {formatMoney(team.bidAvg)}
                      </Text>
                      <Text style={{ color: colors.muted, marginBottom: 6 }}>
                        Max {team.maxBid > 0 ? formatMoney(team.maxBid) : "—"}
                      </Text>
                    </View>

                    <View style={{ marginTop: 8 }}>
                      {team.slots.slice(0, 10).map((slot, index) => (
                        <View
                          key={`${team.teamId}-${slot.position}-${index}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 5,
                            borderTopWidth: index === 0 ? 0 : 1,
                            borderTopColor: colors.border,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.text,
                              fontWeight: "800",
                              width: 42,
                            }}
                          >
                            {slot.position}
                          </Text>

                          <Text
                            numberOfLines={1}
                            style={{
                              color: slot.playerName ? colors.text : colors.muted,
                              flex: 1,
                            }}
                          >
                            {slot.playerName
                              ? `${slot.playerName}${slot.isKeeper ? " (K)" : ""}`
                              : "— empty —"}
                          </Text>

                          {slot.price !== null ? (
                            <Text style={{ color: colors.gold, marginLeft: 6 }}>
                              {formatMoney(slot.price)}
                            </Text>
                          ) : null}
                        </View>
                      ))}

                      {team.slots.length > 10 ? (
                        <Text style={{ color: colors.muted, marginTop: 6 }}>
                          +{team.slots.length - 10} more slots
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </AppCard>

            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>
                Projected Standings
              </Text>

              <Text style={{ color: colors.muted, marginBottom: 10 }}>
                Sort by category. Values use available player projections/stats.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {allCatNames.map((cat) => (
                  <AppChip
                    key={cat}
                    label={`${cat}${sortCat === cat ? (sortAsc ? " ↑" : " ↓") : ""}`}
                    selected={sortCat === cat}
                    onPress={() => toggleSort(cat)}
                    style={{ marginRight: 8 }}
                  />
                ))}
              </ScrollView>

              {sortedStandings.map((row, index) => {
                const value = row.stats[sortCat] ?? 0;
                const rank = rankForCategory(standings, row.teamName, sortCat);

                return (
                  <View
                    key={row.teamName}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900" }}>
                      #{rank} {row.teamName}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 3 }}>
                      {sortCat}: {formatStatCell(sortCat, value)}
                    </Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {allCatNames.map((cat) => (
                        <Text
                          key={cat}
                          style={{
                            color: cat === sortCat ? colors.gold : colors.muted,
                            marginRight: 12,
                            fontSize: 12,
                          }}
                        >
                          {cat} {formatStatCell(cat, row.stats[cat] ?? 0)}
                        </Text>
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
            </AppCard>

            <AppCard>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 4 }}>
                {selectedTeamName} Roster
              </Text>

              <Text style={{ color: colors.muted, marginBottom: 12 }}>
                {selectedTeamEntries.length} players • {formatMoney(selectedTeamRemaining)} remaining
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
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
                        borderTopColor: colors.border,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
                        {entry.playerName}
                      </Text>

                      <Text style={{ color: colors.muted, marginTop: 2 }}>
                        {entry.playerTeam || "FA"} • {(entry.positions ?? []).join("/") || entry.rosterSlot}
                        {entry.isKeeper ? " • Keeper" : ""}
                        {entry.keeperContract ? ` • ${entry.keeperContract}` : ""}
                      </Text>

                      <View style={{ flexDirection: "row", marginTop: 10 }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ color: colors.muted, marginBottom: 4 }}>
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
                              borderColor: colors.border,
                              color: colors.text,
                              borderRadius: 8,
                              padding: 10,
                            }}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.muted, marginBottom: 4 }}>
                            Contract
                          </Text>
                          <TextInput
                            value={edit.keeperContract}
                            onChangeText={(value) =>
                              updateEdit(entry._id, { keeperContract: value })
                            }
                            placeholder="Arb / 3Y"
                            placeholderTextColor={colors.muted}
                            style={{
                              borderWidth: 1,
                              borderColor: colors.border,
                              color: colors.text,
                              borderRadius: 8,
                              padding: 10,
                            }}
                          />
                        </View>
                      </View>

                      <Text style={{ color: colors.muted, marginTop: 10 }}>
                        Slot
                      </Text>

                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        {rosterSlotOptions.map((slot) => (
                          <AppChip
                            key={slot}
                            label={slot}
                            selected={edit.rosterSlot === slot}
                            onPress={() =>
                              updateEdit(entry._id, { rosterSlot: slot })
                            }
                            style={{ marginRight: 8 }}
                          />
                        ))}
                      </ScrollView>

                      <Text style={{ color: colors.muted, marginTop: 10 }}>
                        Move to team
                      </Text>

                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                        {teamNames.map((teamName, index) => {
                          const teamId = teamIdFromIndex(index);

                          return (
                            <AppChip
                              key={teamId}
                              label={teamName}
                              selected={edit.teamId === teamId}
                              onPress={() => updateEdit(entry._id, { teamId })}
                              style={{ marginRight: 8 }}
                            />
                          );
                        })}
                      </ScrollView>

                      <View style={{ flexDirection: "row", marginTop: 12 }}>
                        <View style={{ marginRight: 8 }}>
                          <Button
                            title={isSaving ? "Saving..." : "Save"}
                            disabled={isSaving}
                            onPress={() => void handleSaveEntry(entry)}
                          />
                        </View>

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
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10 }}>
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
                      borderTopColor: colors.border,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "900" }}>
                      #{draftLog.length - index} {entry.playerName}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 2 }}>
                      {teamNameFromId(entry.teamId, teamNames)} • {entry.rosterSlot} • {formatMoney(entry.price)}
                    </Text>

                    <Text style={{ color: colors.muted, marginTop: 2 }}>
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