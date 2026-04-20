import type { RosterEntry } from "../api/roster";

export interface TeamSummary {
  name: string;
  spent: number;
  filled: number;
  open: number;
  remaining: number;
  maxBid: number;
  ppSpot: number;
}

export function computeTeamData(
  league: {
    teamNames: string[];
    rosterSlots: Record<string, number>;
    budget: number;
  },
  entries: RosterEntry[],
): TeamSummary[] {
  const totalSlots = Object.values(league.rosterSlots).reduce(
    (a, b) => a + b,
    0,
  );

  return league.teamNames.map((name, i) => {
    const teamId = `team_${i + 1}`;
    const mine = entries.filter((e) => e.teamId === teamId);
    const spent = mine.reduce((s, e) => s + e.price, 0);
    const filled = mine.length;
    const open = Math.max(0, totalSlots - filled);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    const ppSpot = open > 0 ? +(remaining / open).toFixed(1) : 0;

    return { name, spent, filled, open, remaining, maxBid, ppSpot };
  });
}