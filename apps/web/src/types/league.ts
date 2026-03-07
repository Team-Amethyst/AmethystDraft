// Shared types and constants used by both LeaguesCreate and LeagueSettings.
// TODO(db): availablePlayers should come from the API once player data is persisted.

export type RosterSlot = { position: string; count: number };
export type Player = {
  id: number;
  name: string;
  team: string;
  pos: string;
  adp: number;
};
export type TeamKeeper = {
  slot: string;
  playerName: string;
  team: string;
  cost: number;
  playerId: string;
  entryId?: string;
};
export type TeamKeepersMap = Record<string, TeamKeeper[]>;

export const rosterDefaults: RosterSlot[] = [
  { position: "C", count: 1 },
  { position: "1B", count: 1 },
  { position: "2B", count: 1 },
  { position: "SS", count: 1 },
  { position: "3B", count: 1 },
  { position: "MI", count: 1 },
  { position: "CI", count: 1 },
  { position: "OF", count: 3 },
  { position: "UTIL", count: 1 },
  { position: "SP", count: 5 },
  { position: "RP", count: 2 },
  { position: "BN", count: 3 },
];

export const availablePlayers: Player[] = [
  { id: 1, name: "Ronald Acuña Jr.", team: "ATL", pos: "OF", adp: 1.2 },
  { id: 2, name: "Shohei Ohtani", team: "LAD", pos: "TWP", adp: 2.5 },
  { id: 3, name: "Julio Rodríguez", team: "SEA", pos: "OF", adp: 3.8 },
  { id: 4, name: "Bobby Witt Jr.", team: "KC", pos: "SS", adp: 4.1 },
  { id: 5, name: "Corbin Carroll", team: "ARI", pos: "OF", adp: 5.4 },
  { id: 6, name: "Mookie Betts", team: "LAD", pos: "2B/OF", adp: 6.2 },
  { id: 7, name: "Freddie Freeman", team: "LAD", pos: "1B", adp: 7.0 },
  { id: 8, name: "Kyle Tucker", team: "HOU", pos: "OF", adp: 8.5 },
];

export const hittingStats = [
  "Runs (R)",
  "Home Runs (HR)",
  "Runs Batted In (RBI)",
  "Stolen Bases (SB)",
  "Batting Average (AVG)",
  "On-Base Percentage (OBP)",
  "Slugging Percentage (SLG)",
  "Total Bases (TB)",
  "Hits (H)",
  "Walks (BB)",
  "Strikeouts (K)",
];

export const pitchingStats = [
  "Wins (W)",
  "Strikeouts (K)",
  "Earned Run Average (ERA)",
  "WHIP (Walks + Hits per IP)",
  "Saves (SV)",
  "Holds (HLD)",
  "Quality Starts (QS)",
  "Innings Pitched (IP)",
  "Complete Games (CG)",
  "Wins + Quality Starts (W+QS)",
];

export const keeperSlots = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "OF",
  "OF",
  "OF",
  "IF",
  "P",
];

// ─── Position → eligible roster slot types ───────────────────────────────────

const POSITION_ELIGIBILITY: Record<string, string[]> = {
  C: ["C", "UTIL", "BN"],
  "1B": ["1B", "CI", "UTIL", "BN"],
  "2B": ["2B", "MI", "UTIL", "BN"],
  "3B": ["3B", "CI", "UTIL", "BN"],
  SS: ["SS", "MI", "UTIL", "BN"],
  MI: ["MI", "UTIL", "BN"],
  CI: ["CI", "UTIL", "BN"],
  OF: ["OF", "UTIL", "BN"],
  SP: ["SP", "P", "BN"],
  RP: ["RP", "P", "BN"],
  TWP: ["SP", "RP", "P", "BN"],
  DH: ["UTIL", "BN"],
  IF: ["1B", "2B", "3B", "SS", "CI", "MI", "UTIL", "BN"],
  P: ["SP", "RP", "BN"],
};

export function getEligibleSlots(
  player: Player,
  rosterSlots: RosterSlot[],
  currentKeepers: TeamKeeper[],
): string[] {
  const rawPositions = player.pos.split("/").map((p) => p.trim());
  const eligibleTypes = new Set<string>();
  for (const pos of rawPositions) {
    for (const slot of POSITION_ELIGIBILITY[pos] ?? ["UTIL", "BN"]) {
      eligibleTypes.add(slot);
    }
  }
  const usedCounts: Record<string, number> = {};
  for (const k of currentKeepers) {
    usedCounts[k.slot] = (usedCounts[k.slot] ?? 0) + 1;
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rs of rosterSlots) {
    if (!eligibleTypes.has(rs.position) || rs.count === 0) continue;
    const used = usedCounts[rs.position] ?? 0;
    if (used < rs.count && !seen.has(rs.position)) {
      seen.add(rs.position);
      result.push(rs.position);
    }
  }
  return result;
}
