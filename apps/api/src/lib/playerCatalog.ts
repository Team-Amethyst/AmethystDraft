import { AL_TEAMS, NL_TEAMS } from "./mlbTeams";

export interface PlayerData {
  id: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
  positions: string[];
  age: number;
  adp: number;
  value: number;
  tier: number;
  headshot: string;
  stats: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      obp: string;
      slg: string;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      innings: string;
      completeGames: number;
    };
  };
  projection: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      completeGames: number;
      innings: number;
    };
  };
  /**
   * Equal-weight (1:1:1) blend of the last three completed MLB seasons.
   * Same sample gates as projection (AB/IP per year); distinct from 5/3/2 `projection`.
   */
  stats3yr?: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      obp: string;
      slg: string;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      completeGames: number;
      innings: number;
    };
  };
  outlook: string;
  injuryStatus?: string;
  springStats?: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      ab: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      strikeouts: number;
      innings: string;
    };
  };
}

export function mergeTwoWayPlayers(players: PlayerData[]): PlayerData[] {
  const allMap = new Map<string, PlayerData>();
  for (const p of players) {
    const existing = allMap.get(p.id);
    if (!existing) {
      allMap.set(p.id, p);
      continue;
    }
    const mergedPositions = [
      ...new Set([...existing.positions, ...p.positions]),
    ];
    const pitchingPos = mergedPositions.find((pos) => ["SP", "RP", "P"].includes(pos));
    const winnerByValue = p.value > existing.value ? p : existing;
    allMap.set(p.id, {
      ...winnerByValue,
      position: pitchingPos ?? winnerByValue.position,
      positions: mergedPositions,
      stats: {
        ...existing.stats,
        ...p.stats,
      },
      stats3yr: {
        ...existing.stats3yr,
        ...p.stats3yr,
      },
    });
  }
  return Array.from(allMap.values());
}

export function filterByPlayerPool(
  players: PlayerData[],
  playerPool: "Mixed" | "AL" | "NL",
): PlayerData[] {
  if (playerPool === "AL") return players.filter((p) => AL_TEAMS.has(p.team));
  if (playerPool === "NL") return players.filter((p) => NL_TEAMS.has(p.team));
  return players;
}

export function applyAdpByValue(players: PlayerData[]): PlayerData[] {
  return [...players]
    .sort((a, b) => b.value - a.value)
    .map((p, i) => ({ ...p, adp: i + 1 }));
}

export function sortPlayers(
  players: PlayerData[],
  sortBy: "value" | "adp" | "name",
): PlayerData[] {
  const result = [...players];
  if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === "adp") result.sort((a, b) => a.adp - b.adp);
  else result.sort((a, b) => b.value - a.value);
  return result;
}
