import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
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
import AppCard from "../components/ui/AppCard";
import AppChip from "../components/ui/AppChip";
import { EmptyState, LoadingState } from "../components/ui/ScreenState";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { POSITION_PLAN, useDraftPlan } from "../hooks/useDraftPlan";
import type { LeagueTabParamList } from "../navigation/types";
import type { Player } from "../types/player";
import { computeTeamData } from "../utils/commandCenterUtils";

type Props = BottomTabScreenProps<LeagueTabParamList, "CommandCenter">;
type CommandTab = "Market" | "Teams" | "Standings";

type ScoringCategory = {
  name: string;
  type?: "batting" | "pitching";
};

type TeamProjectionRow = {
  teamId: string;
  teamName: string;
  totalPoints: number;
  categoryValues: Record<string, number>;
  categoryPoints: Record<string, number>;
};

const LOWER_IS_BETTER = new Set(["ERA", "WHIP"]);

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

function entryMatchesPlanPosition(entry: RosterEntry, pos: string): boolean {
  const slot = entry.rosterSlot.toUpperCase();
  const positions = (entry.positions ?? []).map((p) => p.toUpperCase());

  if (pos === "OF") {
    return slot === "OF" || ["LF", "CF", "RF", "OF"].some((p) => positions.includes(p));
  }

  if (pos === "UTIL") {
    return slot === "UTIL" || slot === "UT";
  }

  if (pos === "BN") {
    return slot === "BN" || slot === "BENCH";
  }

  return slot === pos || positions.includes(pos);
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

function normalizeCatName(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const inParens = upper.match(/\(([^)]+)\)$/)?.[1];
  const base = inParens ?? upper;

  if (base === "RUNS") return "R";
  if (base === "HOME RUNS") return "HR";
  if (base === "RUNS BATTED IN") return "RBI";
  if (base === "STOLEN BASES") return "SB";
  if (base === "BATTING AVERAGE") return "AVG";
  if (base === "ON-BASE PERCENTAGE") return "OBP";
  if (base === "SLUGGING PERCENTAGE") return "SLG";
  if (base === "WINS") return "W";
  if (base === "STRIKEOUTS") return "K";
  if (base === "EARNED RUN AVERAGE") return "ERA";
  if (base === "WALKS + HITS PER IP") return "WHIP";
  if (base === "SAVES") return "SV";
  if (base === "HOLDS") return "HLD";
  if (base === "COMPLETE GAMES") return "CG";
  if (base === "INNINGS PITCHED") return "IP";

  return base;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getObjectNumber(
  source: unknown,
  keys: string[],
): number | null {
  if (!source || typeof source !== "object") return null;

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getRatioValueAndWeight(
  player: Player,
  cat: string,
): { value: number; weight: number } | null {
  const battingProj = player.projection?.batting as Record<string, unknown> | undefined;
  const battingStats = player.stats?.batting as Record<string, unknown> | undefined;
  const pitchingProj = player.projection?.pitching as Record<string, unknown> | undefined;
  const pitchingStats = player.stats?.pitching as Record<string, unknown> | undefined;

  if (cat === "AVG") {
    const value =
      getObjectNumber(battingProj, ["avg", "AVG"]) ??
      getObjectNumber(battingStats, ["avg", "AVG"]);
    const weight =
      getObjectNumber(battingProj, ["ab", "atBats", "at_bats", "AB"]) ??
      getObjectNumber(battingStats, ["ab", "atBats", "at_bats", "AB"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "OBP") {
    const value =
      getObjectNumber(battingProj, ["obp", "OBP"]) ??
      getObjectNumber(battingStats, ["obp", "OBP"]);
    const weight =
      getObjectNumber(battingProj, ["pa", "plateAppearances", "plate_appearances"]) ??
      getObjectNumber(battingStats, ["pa", "plateAppearances", "plate_appearances"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "SLG") {
    const value =
      getObjectNumber(battingProj, ["slg", "SLG"]) ??
      getObjectNumber(battingStats, ["slg", "SLG"]);
    const weight =
      getObjectNumber(battingProj, ["ab", "atBats", "at_bats", "AB"]) ??
      getObjectNumber(battingStats, ["ab", "atBats", "at_bats", "AB"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "ERA") {
    const value =
      getObjectNumber(pitchingProj, ["era", "ERA"]) ??
      getObjectNumber(pitchingStats, ["era", "ERA"]);
    const weight =
      getObjectNumber(pitchingProj, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      getObjectNumber(pitchingStats, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  if (cat === "WHIP") {
    const value =
      getObjectNumber(pitchingProj, ["whip", "WHIP"]) ??
      getObjectNumber(pitchingStats, ["whip", "WHIP"]);
    const weight =
      getObjectNumber(pitchingProj, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      getObjectNumber(pitchingStats, ["innings", "ip", "inningsPitched", "innings_pitched"]) ??
      1;

    return value === null ? null : { value, weight };
  }

  return null;
}

function getCategoryValue(player: Player, cat: string): number {
  const battingProj = player.projection?.batting;
  const battingStats = player.stats?.batting;
  const pitchingProj = player.projection?.pitching;
  const pitchingStats = player.stats?.pitching;

  switch (cat) {
    case "HR":
      return toNumber(battingProj?.hr ?? battingStats?.hr);
    case "RBI":
      return toNumber(battingProj?.rbi ?? battingStats?.rbi);
    case "R":
      return toNumber(battingProj?.runs ?? battingStats?.runs);
    case "SB":
      return toNumber(battingProj?.sb ?? battingStats?.sb);
    case "AVG":
      return toNumber(battingProj?.avg ?? battingStats?.avg);
    case "OBP":
      return toNumber(battingStats?.obp);
    case "SLG":
      return toNumber(battingStats?.slg);
    case "W":
      return toNumber(pitchingProj?.wins ?? pitchingStats?.wins);
    case "K":
      return toNumber(pitchingProj?.strikeouts ?? pitchingStats?.strikeouts);
    case "ERA":
      return toNumber(pitchingProj?.era ?? pitchingStats?.era);
    case "WHIP":
      return toNumber(pitchingProj?.whip ?? pitchingStats?.whip);
    case "SV":
      return toNumber(pitchingProj?.saves ?? pitchingStats?.saves);
    case "HLD":
      return toNumber(pitchingProj?.holds ?? pitchingStats?.holds);
    case "CG":
      return toNumber(pitchingProj?.completeGames ?? pitchingStats?.completeGames);
    case "IP":
      return toNumber(pitchingProj?.innings ?? pitchingStats?.innings);
    default:
      return 0;
  }
}

function formatCategoryValue(cat: string, value: number): string {
  if (cat === "AVG" || cat === "OBP" || cat === "SLG" || cat === "ERA" || cat === "WHIP") {
    return value.toFixed(3);
  }
  return value.toFixed(0);
}

function rankCategory(
  rows: Array<{ teamId: string; value: number }>,
  lowerIsBetter: boolean,
): Record<string, number> {
  const sorted = [...rows].sort((a, b) => {
    if (lowerIsBetter) return a.value - b.value;
    return b.value - a.value;
  });

  const teams = sorted.length;
  const result: Record<string, number> = {};

  sorted.forEach((row, index) => {
    result[row.teamId] = teams - index;
  });

  return result;
}

export default function CommandCenterScreen({ route }: Props) {
  const { leagueId } = route.params;
  const { token, user } = useAuth();
  const { allLeagues } = useLeague();
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { getNote, loadNotes, setNote } = usePlayerNotes();

  const [activeTab, setActiveTab] = useState<CommandTab>("Market");

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
  const { positionTargets } = useDraftPlan(leagueId);

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

    return {
      position: primaryPosition,
      avgCatalogValue,
      avgPaid,
      delta,
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

  const myTeamId = "team_1";

  const posBudgetPlan = useMemo(() => {
    const myEntries = roster.filter((entry) => entry.teamId === myTeamId);

    return POSITION_PLAN.map((row) => {
      const spent = myEntries
        .filter((entry) => entryMatchesPlanPosition(entry, row.pos))
        .reduce((sum, entry) => sum + entry.price, 0);

      const filled = myEntries.filter((entry) =>
        entryMatchesPlanPosition(entry, row.pos),
      ).length;

      const open = Math.max(0, row.slots - filled);
      const target = positionTargets[row.pos] ?? row.target;
      const delta = target - spent;

      return {
        pos: row.pos,
        open,
        target,
        spent,
        delta,
      };
    });
  }, [positionTargets, roster]);

  const budgetAttentionRows = useMemo(() => {
    return posBudgetPlan
      .map((row) => {
        const pct = row.target > 0 ? row.spent / row.target : 0;

        let severity: "high" | "medium" | "low" | null = null;
        let message = "";

        if (row.delta < 0) {
          severity = "high";
          message = `${row.pos} is over target by $${Math.abs(row.delta)}.`;
        } else if (pct >= 0.85 && row.open > 0) {
          severity = "medium";
          message = `${row.pos} is nearing budget with ${row.open} slot(s) still open.`;
        } else if (row.open > 0 && row.spent === 0) {
          severity = "low";
          message = `${row.pos} still has ${row.open} open slot(s) with no spend yet.`;
        }

        return {
          ...row,
          severity,
          message,
        };
      })
      .filter((row) => row.severity !== null)
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2, null: 3 };
        return rank[a.severity ?? "null"] - rank[b.severity ?? "null"];
      });
  }, [posBudgetPlan]);

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

    const availablePlayerIds = Array.from(
      new Map(
        players
          .filter((player) => !draftedIds.has(player.id))
          .filter((player) => !player.id.startsWith("custom:"))
          .sort((a, b) => {
            const valueDiff = (b.value ?? 0) - (a.value ?? 0);
            if (Math.abs(valueDiff) > 0.001) {
              return valueDiff;
            }

            return (a.adp ?? 9999) - (b.adp ?? 9999);
          })
          .map((player) => [player.id, player] as const),
      ).values(),
    )
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

  const projectedStandings = useMemo(() => {
    if (!league) return [] as TeamProjectionRow[];

    const categories = (league.scoringCategories ?? []) as ScoringCategory[];
    const playerMap = new Map(players.map((player) => [player.id, player]));

    const rows: TeamProjectionRow[] = league.teamNames.map((teamName, index) => {
      const teamId = `team_${index + 1}`;
      const teamEntries = roster.filter((entry) => entry.teamId === teamId);

      const categoryValues: Record<string, number> = {};

      for (const category of categories) {
        const cat = normalizeCatName(category.name);
        const isRatioCat =
          cat === "AVG" ||
          cat === "OBP" ||
          cat === "SLG" ||
          cat === "ERA" ||
          cat === "WHIP";

        if (isRatioCat) {
          let weightedSum = 0;
          let totalWeight = 0;

          for (const entry of teamEntries) {
            const player = playerMap.get(entry.externalPlayerId);
            if (!player) continue;

            const ratio = getRatioValueAndWeight(player, cat);
            if (!ratio) continue;

            weightedSum += ratio.value * ratio.weight;
            totalWeight += ratio.weight;
          }

          categoryValues[cat] = totalWeight > 0 ? weightedSum / totalWeight : 0;
        } else {
          categoryValues[cat] = teamEntries.reduce((sum, entry) => {
            const player = playerMap.get(entry.externalPlayerId);
            return sum + (player ? getCategoryValue(player, cat) : 0);
          }, 0);
        }
      }

      return {
        teamId,
        teamName,
        totalPoints: 0,
        categoryValues,
        categoryPoints: {},
      };
    });

    for (const category of categories) {
      const cat = normalizeCatName(category.name);
      const pointsByTeam = rankCategory(
        rows.map((row) => ({
          teamId: row.teamId,
          value: row.categoryValues[cat] ?? 0,
        })),
        LOWER_IS_BETTER.has(cat),
      );

      rows.forEach((row) => {
        row.categoryPoints[cat] = pointsByTeam[row.teamId] ?? 0;
      });
    }

    rows.forEach((row) => {
      row.totalPoints = Object.values(row.categoryPoints).reduce(
        (sum, value) => sum + value,
        0,
      );
    });

    return rows.sort((a, b) => b.totalPoints - a.totalPoints);
  }, [league, players, roster]);

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
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <LoadingState label="Loading draft room..." />
      </SafeAreaView>
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <EmptyState label="League not found." />
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

        <View style={{ flexDirection: "row", marginBottom: 14 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <AppChip
              label="Market"
              selected={activeTab === "Market"}
              fullWidth
              onPress={() => setActiveTab("Market")}
            />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <AppChip
              label="Teams"
              selected={activeTab === "Teams"}
              fullWidth
              onPress={() => setActiveTab("Teams")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppChip
              label="Standings"
              selected={activeTab === "Standings"}
              fullWidth
              onPress={() => setActiveTab("Standings")}
            />
          </View>
        </View>

        {activeTab === "Market" ? (
          <>
            {newsStrip ? (
              <AppCard backgroundColor="#eff6ff" borderColor="#bfdbfe">
                <Text style={{ color: "#1e3a8a", fontWeight: "600" }}>{newsStrip}</Text>
              </AppCard>
            ) : null}

            <AppCard backgroundColor="#fcfcfc">
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
            </AppCard>

            {selectedPlayer ? (
              <AppCard backgroundColor="#eef2ff" borderColor="#c7d2fe">
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
              </AppCard>
            ) : (
              <EmptyState label="Select a player from Research or My Draft." />
            )}

            {valuationSnapshot ? (
              <AppCard backgroundColor="#faf5ff" borderColor="#ddd6fe">
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
              </AppCard>
            ) : null}

            <AppCard backgroundColor="#fafafa">
              <Text style={{ fontWeight: "700", marginBottom: 8 }}>
                Position Budget Plan
              </Text>

              {posBudgetPlan.map((row, index) => {
                const pct = row.target > 0 ? row.spent / row.target : 0;
                const spentColor =
                  pct > 1 ? "#ef4444" : pct >= 0.8 ? "#f59e0b" : row.spent > 0 ? "#22c55e" : "#111827";

                return (
                  <View
                    key={row.pos}
                    style={{
                      paddingVertical: 8,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#f1f5f9",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700" }}>{row.pos}</Text>
                      <Text style={{ color: "#6b7280" }}>
                        Open {row.open} • Target ${row.target}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: spentColor }}>Spent ${row.spent}</Text>
                      <Text style={{ color: row.delta >= 0 ? "#22c55e" : "#ef4444" }}>
                        {row.delta >= 0 ? `+${row.delta}` : row.delta}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </AppCard>

            <AppCard backgroundColor="#fafafa">
              <Text style={{ fontWeight: "700", marginBottom: 8 }}>
                Budget Attention
              </Text>

              {budgetAttentionRows.length === 0 ? (
                <Text style={{ color: "#6b7280" }}>No budget warnings right now.</Text>
              ) : (
                budgetAttentionRows.map((row, index) => {
                  const color =
                    row.severity === "high"
                      ? "#b91c1c"
                      : row.severity === "medium"
                      ? "#92400e"
                      : "#1d4ed8";

                  return (
                    <View
                      key={row.pos}
                      style={{
                        paddingVertical: 8,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: "#f1f5f9",
                      }}
                    >
                      <Text style={{ fontWeight: "700", color }}>{row.pos}</Text>
                      <Text style={{ color }}>{row.message}</Text>
                    </View>
                  );
                })
              )}
            </AppCard>

            {loadingMockPicks ? (
              <AppCard>
                <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                  Mock Pick Predictions
                </Text>
                <LoadingState label="Loading mock picks..." />
              </AppCard>
            ) : mockPredictions.length > 0 ? (
              <AppCard backgroundColor="#fafafa">
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
                      <AppChip
                        label="Open Player"
                        selected
                        onPress={() => openPlayerById(prediction.predicted_player.player_id)}
                      />
                    </View>
                  </View>
                ))}
              </AppCard>
            ) : (
              <EmptyState label="No mock pick predictions right now." />
            )}

            {localPositionMarket ? (
              <AppCard backgroundColor="#fafafa">
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
              </AppCard>
            ) : null}

            {enginePosRow ? (
              <AppCard backgroundColor="#f8fbff" borderColor="#dbeafe">
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
                    {selectedTierBuckets.map((bucket, index) => (
                      <View
                        key={bucket.tier}
                        style={{
                          paddingVertical: 6,
                          borderTopWidth: index === 0 ? 0 : 1,
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
              </AppCard>
            ) : null}

            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                marginTop: 8,
                marginBottom: 10,
              }}
            >
              Draft Log
            </Text>

            {recentPicks.length === 0 ? (
              <EmptyState label="No picks yet." />
            ) : (
              recentPicks.map((pick) => {
                const isEditing = editingPickId === pick._id;
                const isWorking = workingPickId === pick._id;

                return (
                  <AppCard key={pick._id}>
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
                  </AppCard>
                );
              })
            )}
          </>
        ) : null}

        {activeTab === "Teams" ? (
          <>
            <Text style={{ marginBottom: 12, color: "#4b5563" }}>
              Team liquidity and budget state
            </Text>

            {teamData.length === 0 ? (
              <EmptyState label="No team data yet." />
            ) : (
              teamData.map((item) => (
                <AppCard key={item.name}>
                  <Text style={{ fontWeight: "700" }}>{item.name}</Text>
                  <Text>Spent: ${item.spent}</Text>
                  <Text>Remaining: ${item.remaining}</Text>
                  <Text>Open spots: {item.open}</Text>
                  <Text>Max bid: ${item.maxBid}</Text>
                  <Text>$ / spot: {item.ppSpot}</Text>
                </AppCard>
              ))
            )}

            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                marginTop: 12,
                marginBottom: 10,
              }}
            >
              Recent Picks
            </Text>

            {recentPicks.length === 0 ? (
              <EmptyState label="No picks yet." />
            ) : (
              recentPicks.slice(0, 10).map((pick) => (
                <AppCard key={pick._id}>
                  <Text style={{ fontWeight: "600" }}>{pick.playerName}</Text>
                  <Text>
                    {teamNameFromId(pick.teamId, league.teamNames)} • {pick.rosterSlot} • ${pick.price}
                  </Text>
                </AppCard>
              ))
            )}
          </>
        ) : null}

        {activeTab === "Standings" ? (
          <>
            <Text style={{ marginBottom: 12, color: "#4b5563" }}>
              Lightweight projected roto standings from current rostered players
            </Text>

            {projectedStandings.length === 0 ? (
              <EmptyState label="No standings data available yet." />
            ) : (
              projectedStandings.map((row, index) => (
                <AppCard key={row.teamId}>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                    #{index + 1} {row.teamName}
                  </Text>
                  <Text style={{ marginBottom: 8 }}>
                    Total roto points: {row.totalPoints}
                  </Text>

                  {(league.scoringCategories as ScoringCategory[]).map((category, catIndex) => {
                    const cat = normalizeCatName(category.name);
                    const value = row.categoryValues[cat] ?? 0;
                    const points = row.categoryPoints[cat] ?? 0;

                    return (
                      <View
                        key={`${row.teamId}-${cat}`}
                        style={{
                          paddingVertical: 6,
                          borderTopWidth: catIndex === 0 ? 0 : 1,
                          borderTopColor: "#f1f5f9",
                        }}
                      >
                        <Text>
                          {cat}: {formatCategoryValue(cat, value)} • {points} pts
                        </Text>
                      </View>
                    );
                  })}
                </AppCard>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}