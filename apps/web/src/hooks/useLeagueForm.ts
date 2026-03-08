import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  type RosterSlot,
  type Player,
  type TeamKeepersMap,
  rosterDefaults,
  availablePlayers,
  getEligibleSlots,
} from "../types/league";

interface UseLeagueFormOptions {
  initialName?: string;
  initialTeams?: number;
  initialBudget?: number;
  initialPlayerPool?: "Mixed MLB" | "AL-Only" | "NL-Only";
  initialHitting?: string[];
  initialPitching?: string[];
  initialRosterSlots?: Record<string, number>;
  initialTeamNames?: string[];
  initialKeepers?: TeamKeepersMap;
  initialPosEligibilityThreshold?: number;
}

export function useLeagueForm({
  initialName = "My League",
  initialTeams = 12,
  initialBudget = 260,
  initialPlayerPool,
  initialHitting,
  initialPitching,
  initialRosterSlots,
  initialTeamNames,
  initialKeepers,
  initialPosEligibilityThreshold,
}: UseLeagueFormOptions = {}) {
  const [leagueName, setLeagueName] = useState(initialName);
  const [teams, setTeams] = useState(initialTeams);
  const [budget, setBudget] = useState(initialBudget);
  const [posEligibilityThreshold, setPosEligibilityThreshold] = useState(
    initialPosEligibilityThreshold ?? 20,
  );
  const [rosterSlots, setRosterSlots] = useState<RosterSlot[]>(
    initialRosterSlots
      ? rosterDefaults.map((s) => ({
          ...s,
          count: initialRosterSlots[s.position] ?? s.count,
        }))
      : rosterDefaults,
  );

  const [playerPool, setPlayerPool] = useState<
    "Mixed MLB" | "AL-Only" | "NL-Only"
  >(initialPlayerPool ?? "Mixed MLB");
  const [selectedHitting, setSelectedHitting] = useState<string[]>(
    initialHitting ?? [
      "Runs (R)",
      "Home Runs (HR)",
      "Runs Batted In (RBI)",
      "Stolen Bases (SB)",
      "Batting Average (AVG)",
    ],
  );
  const [selectedPitching, setSelectedPitching] = useState<string[]>(
    initialPitching ?? [
      "Wins (W)",
      "Strikeouts (K)",
      "Earned Run Average (ERA)",
      "WHIP (Walks + Hits per IP)",
      "Saves (SV)",
    ],
  );

  const [teamNames, setTeamNames] = useState<string[]>(
    initialTeamNames && initialTeamNames.length > 0
      ? Array.from(
          { length: 20 },
          (_, i) => initialTeamNames[i] ?? `Team ${i + 1}`,
        )
      : Array.from({ length: 20 }, (_, i) => `Team ${i + 1}`),
  );

  const [activeKeeperTeam, setActiveKeeperTeam] = useState(
    () => initialTeamNames?.[0] ?? "Team 1",
  );
  const [playerSearch, setPlayerSearch] = useState("");
  const [teamKeepers, setTeamKeepers] = useState<TeamKeepersMap>(
    initialKeepers ?? {},
  );

  const totalRosterSpots = useMemo(
    () => rosterSlots.reduce((sum, s) => sum + s.count, 0),
    [rosterSlots],
  );

  const filteredPlayers = useMemo(
    () =>
      availablePlayers.filter((p) =>
        p.name.toLowerCase().includes(playerSearch.toLowerCase()),
      ),
    [playerSearch],
  );

  const currentKeepers = teamKeepers[activeKeeperTeam] ?? [];
  const keeperBudgetUsed = currentKeepers.reduce((sum, k) => sum + k.cost, 0);
  const remainingBudget = budget - keeperBudgetUsed;
  const completionPercent =
    totalRosterSpots > 0
      ? Math.round((currentKeepers.length / totalRosterSpots) * 100)
      : 0;

  const toggleStat = (
    stat: string,
    selected: string[],
    setter: Dispatch<SetStateAction<string[]>>,
  ) =>
    setter(
      selected.includes(stat)
        ? selected.filter((s) => s !== stat)
        : [...selected, stat],
    );

  const updateRosterCount = (position: string, delta: number) =>
    setRosterSlots((prev) =>
      prev.map((s) =>
        s.position === position
          ? { ...s, count: Math.max(0, s.count + delta) }
          : s,
      ),
    );

  const updateTeamName = (index: number, value: string) => {
    const next = [...teamNames];
    const prev = next[index];
    next[index] = value;
    setTeamNames(next);
    if (prev === activeKeeperTeam)
      setActiveKeeperTeam(value || `Team ${index + 1}`);
  };

  const addKeeper = (player: Player, slot: string) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: [
        ...current,
        {
          slot,
          playerName: player.name,
          team: player.team,
          cost: Math.floor(player.adp * 2 + 10),
          playerId: String(player.id),
        },
      ],
    });
  };

  const getEligibleSlotsForPlayer = (player: Player): string[] =>
    getEligibleSlots(player, rosterSlots, currentKeepers);

  const removeKeeper = (index: number) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: current.filter((_, i) => i !== index),
    });
  };

  return {
    leagueName,
    setLeagueName,
    teams,
    setTeams,
    budget,
    setBudget,
    posEligibilityThreshold,
    setPosEligibilityThreshold,
    rosterSlots,
    totalRosterSpots,
    playerPool,
    setPlayerPool,
    selectedHitting,
    setSelectedHitting,
    selectedPitching,
    setSelectedPitching,
    teamNames,
    activeKeeperTeam,
    setActiveKeeperTeam,
    playerSearch,
    setPlayerSearch,
    teamKeepers,
    setTeamKeepers,
    currentKeepers,
    remainingBudget,
    completionPercent,
    filteredPlayers,
    toggleStat,
    updateRosterCount,
    updateTeamName,
    addKeeper,
    removeKeeper,
    getEligibleSlotsForPlayer,
  };
}
