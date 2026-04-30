import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  type RosterSlot,
  type Player,
  type TeamKeeper,
  type TeamKeepersMap,
  rosterDefaults,
  getEligibleSlots,
  getEligibleSlotsForKeeperAssignment,
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
  /** Real API players to use in the keeper picker instead of the static stub */
  externalPlayers?: Player[];
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
  externalPlayers,
}: UseLeagueFormOptions = {}) {
  const initialRosterSlotsState = useMemo(
    () =>
      initialRosterSlots
        ? rosterDefaults.map((s) => ({
            ...s,
            count: initialRosterSlots[s.position] ?? s.count,
          }))
        : rosterDefaults,
    [initialRosterSlots],
  );

  const [leagueName, setLeagueName] = useState(initialName);
  const [teams, setTeams] = useState(initialTeams);
  const [budget, setBudget] = useState(initialBudget);
  const [posEligibilityThreshold, setPosEligibilityThreshold] = useState(
    initialPosEligibilityThreshold ?? 20,
  );
  const [rosterSlots, setRosterSlots] = useState<RosterSlot[]>(
    initialRosterSlotsState,
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
      "Walks + Hits per IP (WHIP)",
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
      (externalPlayers ?? []).filter((p) =>
        p.name.toLowerCase().includes(playerSearch.toLowerCase()),
      ),
    [externalPlayers, playerSearch],
  );

  const currentKeepers = teamKeepers[activeKeeperTeam] ?? [];
  const keeperBudgetUsed = currentKeepers.reduce((sum, k) => sum + k.cost, 0);
  const remainingBudget = budget - keeperBudgetUsed;
  const completionPercent =
    totalRosterSpots > 0
      ? Math.round((currentKeepers.length / totalRosterSpots) * 100)
      : 0;

  /** Maps playerId → teamName for every keeper across all teams */
  const keeperOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [team, keepers] of Object.entries(teamKeepers)) {
      for (const k of keepers) {
        map.set(k.playerId, team);
      }
    }
    return map;
  }, [teamKeepers]);

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

  const setRosterCount = (position: string, count: number) =>
    setRosterSlots((prev) =>
      prev.map((s) =>
        s.position === position
          ? { ...s, count: Math.max(0, Math.round(count)) }
          : s,
      ),
    );

  const resetRosterSlots = () =>
    setRosterSlots(initialRosterSlotsState.map((slot) => ({ ...slot })));

  const updateTeamName = (index: number, value: string) => {
    const next = [...teamNames];
    const prev = next[index];
    next[index] = value;
    setTeamNames(next);
    if (prev === activeKeeperTeam)
      setActiveKeeperTeam(value || `Team ${index + 1}`);
  };

  const addKeeper = (
    player: Player,
    slot: string,
    cost?: number,
    contractType?: string,
  ) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    const resolvedCost =
      cost ?? player.value ?? Math.floor(player.adp * 2 + 10);
    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: [
        ...current,
        {
          slot,
          playerName: player.name,
          team: player.team,
          cost: Math.max(1, Math.round(resolvedCost)),
          contractType: contractType?.trim() || undefined,
          playerId: String(player.id),
              positions: player.positions,
        },
      ],
    });
  };

  const updateKeeperCost = (index: number, cost: number) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    const updated = current.map((k, i) =>
      i === index ? { ...k, cost: Math.max(1, Math.round(cost)) } : k,
    );
    setTeamKeepers({ ...teamKeepers, [activeKeeperTeam]: updated });
  };

  const updateKeeperContract = (index: number, contractType: string) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    const normalized = contractType.trim();
    const updated = current.map((k, i) =>
      i === index
        ? { ...k, contractType: normalized === "" ? undefined : normalized }
        : k,
    );
    setTeamKeepers({ ...teamKeepers, [activeKeeperTeam]: updated });
  };

  const getEligibleSlotsForPlayer = (player: Player): string[] => {
    const ownedByTeam = keeperOwnerMap.get(String(player.id));
    // Already kept by another team or already kept on this team
    if (ownedByTeam) return [];
    return getEligibleSlots(player, rosterSlots, currentKeepers);
  };

  const removeKeeper = (index: number) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: current.filter((_, i) => i !== index),
    });
  };

  const teamKeeperToPlayer = (k: TeamKeeper): Player => {
    const positions =
      k.positions && k.positions.length > 0 ? k.positions : [k.slot];
    const primary = positions[0] ?? k.slot;
    return {
      id: Number.parseInt(String(k.playerId), 10) || 0,
      name: k.playerName,
      team: k.team,
      pos: primary,
      adp: 99,
      positions,
    };
  };

  const getEligibleSlotsForKeeperAtIndex = (index: number): string[] => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    const keeper = current[index];
    if (!keeper) return [];
    const fromPool = externalPlayers?.find(
      (p) => String(p.id) === keeper.playerId,
    );
    const player = fromPool ?? teamKeeperToPlayer(keeper);
    return getEligibleSlotsForKeeperAssignment(
      player,
      rosterSlots,
      current,
      index,
    );
  };

  const updateKeeperSlot = (index: number, newSlot: string) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    const updated = current.map((k, i) =>
      i === index ? { ...k, slot: newSlot } : k,
    );
    setTeamKeepers({ ...teamKeepers, [activeKeeperTeam]: updated });
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
    setRosterCount,
    resetRosterSlots,
    updateTeamName,
    addKeeper,
    removeKeeper,
    updateKeeperCost,
    updateKeeperContract,
    updateKeeperSlot,
    getEligibleSlotsForPlayer,
    getEligibleSlotsForKeeperAtIndex,
    keeperOwnerMap,
  };
}
