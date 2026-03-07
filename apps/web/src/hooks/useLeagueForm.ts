import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  type RosterSlot,
  type Player,
  type TeamKeepersMap,
  rosterDefaults,
  availablePlayers,
  keeperSlots,
} from "../types/league";

interface UseLeagueFormOptions {
  initialName?: string;
  initialTeams?: number;
  initialBudget?: number;
  initialPlayerPool?: "Mixed MLB" | "AL-Only" | "NL-Only";
  initialHitting?: string[];
  initialPitching?: string[];
  initialRosterSlots?: Record<string, number>;
}

export function useLeagueForm({
  initialName = "My League",
  initialTeams = 12,
  initialBudget = 260,
  initialPlayerPool,
  initialHitting,
  initialPitching,
  initialRosterSlots,
}: UseLeagueFormOptions = {}) {
  const [leagueName, setLeagueName] = useState(initialName);
  const [teams, setTeams] = useState(initialTeams);
  const [budget, setBudget] = useState(initialBudget);
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

  // Initialize with enough slots for the maximum supported team count (20).
  // Components slice to `teams` when rendering.
  const [teamNames, setTeamNames] = useState<string[]>(
    Array.from({ length: 20 }, (_, i) => `Team ${i + 1}`),
  );

  const [activeKeeperTeam, setActiveKeeperTeam] = useState("Team 1");
  const [playerSearch, setPlayerSearch] = useState("");
  const [teamKeepers, setTeamKeepers] = useState<TeamKeepersMap>({
    "Team 1": [
      { slot: "C", playerName: "J.T. Realmuto", team: "PHI", cost: 29 },
      { slot: "SS", playerName: "Bobby Witt Jr.", team: "KC", cost: 19 },
      { slot: "OF", playerName: "Ronald Acuña Jr.", team: "ATL", cost: 17 },
    ],
  });

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
  const completionPercent = Math.round(
    (currentKeepers.length / keeperSlots.length) * 100,
  );

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

  const addKeeper = (player: Player) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    if (current.length >= keeperSlots.length) return;
    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: [
        ...current,
        {
          slot: keeperSlots[current.length],
          playerName: player.name,
          team: player.team,
          cost: Math.floor(player.adp * 2 + 10),
        },
      ],
    });
  };

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
    currentKeepers,
    remainingBudget,
    completionPercent,
    filteredPlayers,
    toggleStat,
    updateRosterCount,
    updateTeamName,
    addKeeper,
    removeKeeper,
  };
}
