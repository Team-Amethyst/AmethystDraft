import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamSummary {
  name: string;
  spent: number;
  filled: number;
  open: number;
  remaining: number;
  maxBid: number;
  ppSpot: number;
}

export interface PositionMarket {
  position: string;
  avgWinPrice: number;
  avgProjValue: number;
  inflation: number;
  remainingCount: number;
  scarcityRankNum: number;
  scarcityRankOf: number;
  supply: Array<{ tier: number; count: number; avgVal: number | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getStatByCategory(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const name = catName.toUpperCase();
  if (catType === "batting") {
    const b = player.stats?.batting;
    if (!b) return 0;
    if (name === "HR") return b.hr;
    if (name === "RBI") return b.rbi;
    if (name === "R" || name === "RUNS") return b.runs;
    if (name === "SB") return b.sb;
    if (name === "AVG") return parseFloat(b.avg) || 0;
    if (name === "OBP") return parseFloat(b.obp) || 0;
    if (name === "SLG") return parseFloat(b.slg) || 0;
    return 0;
  } else {
    const p = player.stats?.pitching;
    if (!p) return 0;
    if (name === "W" || name === "WINS") return p.wins;
    if (name === "K" || name === "SO") return p.strikeouts;
    if (name === "ERA") return parseFloat(p.era) || 0;
    if (name === "WHIP" || name === "WALKS + HITS PER IP")
      return parseFloat(p.whip) || 0;
    if (name === "SV" || name === "SAVES") return p.saves;
    if (name === "IP") return parseFloat(p.innings) || 0;
    return 0;
  }
}

export function computeTeamData(
  league: League,
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

export function computePositionMarket(
  position: string | null,
  allPlayers: Player[],
  draftedIds: Set<string>,
  rosterEntries: RosterEntry[],
): PositionMarket | null {
  if (!position || allPlayers.length === 0) return null;
  const posPlayers = allPlayers.filter((p) => p.position === position);
  const draftedAtPos = posPlayers.filter((p) => draftedIds.has(p.id));
  const remaining = posPlayers.filter((p) => !draftedIds.has(p.id));
  const draftedEntries = rosterEntries.filter((e) =>
    draftedAtPos.some((p) => p.id === e.externalPlayerId),
  );
  const avgWinPrice = draftedEntries.length
    ? Math.round(
        draftedEntries.reduce((s, e) => s + e.price, 0) / draftedEntries.length,
      )
    : 0;
  const avgProjValue = remaining.length
    ? Math.round(remaining.reduce((s, p) => s + p.value, 0) / remaining.length)
    : 0;
  const inflation =
    avgWinPrice > 0 && avgProjValue > 0
      ? Math.round((avgWinPrice / avgProjValue - 1) * 100)
      : 0;

  const allPositions = [...new Set(allPlayers.map((p) => p.position))];
  const remainingByPos = allPositions
    .map((pos) => ({
      pos,
      count: allPlayers.filter(
        (p) => p.position === pos && !draftedIds.has(p.id),
      ).length,
    }))
    .sort((a, b) => a.count - b.count);
  const scarcityRankNum =
    remainingByPos.findIndex((r) => r.pos === position) + 1;
  const scarcityRankOf = remainingByPos.length;

  const allTiers = [...new Set(remaining.map((p) => p.tier))].sort(
    (a, b) => a - b,
  );
  const avgOrNull = (arr: Player[]) =>
    arr.length
      ? Math.round(arr.reduce((s, p) => s + p.value, 0) / arr.length)
      : null;

  return {
    position,
    avgWinPrice,
    avgProjValue,
    inflation,
    remainingCount: remaining.length,
    scarcityRankNum,
    scarcityRankOf,
    supply: allTiers.map((tier) => {
      const arr = remaining.filter((p) => p.tier === tier);
      return { tier, count: arr.length, avgVal: avgOrNull(arr) };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Projected standings
// ─────────────────────────────────────────────────────────────────────────────

export const LOWER_IS_BETTER_CATS = new Set([
  "ERA",
  "WHIP",
  "WALKS + HITS PER IP",
]);

export interface ProjectedStandingsRow {
  teamName: string;
  stats: Record<string, number>;
}

function getProjStat(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const n = catName.toUpperCase();
  if (catType === "batting") {
    const b = player.projection?.batting ?? player.stats?.batting;
    if (!b) return 0;
    if (n === "HR") return b.hr;
    if (n === "RBI") return b.rbi;
    if (n === "R" || n === "RUNS") return b.runs;
    if (n === "SB") return b.sb;
    if (n === "AVG") return parseFloat(String(b.avg)) || 0;
    if (n === "OBP")
      return parseFloat(String(player.stats?.batting?.obp ?? "0")) || 0;
    if (n === "SLG")
      return parseFloat(String(player.stats?.batting?.slg ?? "0")) || 0;
    return 0;
  } else {
    const p = player.projection?.pitching ?? player.stats?.pitching;
    if (!p) return 0;
    if (n === "W" || n === "WINS") return p.wins;
    if (n === "K" || n === "SO") return p.strikeouts;
    if (n === "ERA") return parseFloat(String(p.era)) || 0;
    if (n === "WHIP" || n === "WALKS + HITS PER IP")
      return parseFloat(String(p.whip)) || 0;
    if (n === "SV" || n === "SAVES") return p.saves;
    return 0;
  }
}

// Rate stats that need averaging rather than summing
const RATE_BATTING = new Set(["AVG", "OBP", "SLG"]);
const RATE_PITCHING = new Set(["ERA", "WHIP", "WALKS + HITS PER IP"]);

export function buildProjectedStandings(
  teamNames: string[],
  entries: RosterEntry[],
  playerMap: Map<string, Player>,
  scoringCategories: { name: string; type: "batting" | "pitching" }[],
): ProjectedStandingsRow[] {
  return teamNames.map((teamName, i) => {
    const teamId = `team_${i + 1}`;
    const teamPlayers = entries
      .filter((e) => e.teamId === teamId)
      .map((e) => playerMap.get(e.externalPlayerId))
      .filter((p): p is Player => !!p);

    const stats: Record<string, number> = {};

    for (const cat of scoringCategories) {
      const n = cat.name.toUpperCase();

      if (cat.type === "batting" && RATE_BATTING.has(n)) {
        // Weighted average by projected HR+1 as AB proxy
        const batters = teamPlayers.filter(
          (p) => !!(p.projection?.batting ?? p.stats?.batting),
        );
        const weights = batters.map((p) => {
          const b = p.projection?.batting ?? p.stats?.batting;
          return (b?.hr ?? 0) + 1;
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const weighted = batters.reduce(
          (sum, p, idx) =>
            sum + getProjStat(p, cat.name, "batting") * weights[idx],
          0,
        );
        stats[cat.name] = totalWeight > 0 ? weighted / totalWeight : 0;
      } else if (cat.type === "pitching" && RATE_PITCHING.has(n)) {
        // Mean across pitchers with a non-zero rate
        const pitchers = teamPlayers.filter(
          (p) => !!(p.projection?.pitching ?? p.stats?.pitching),
        );
        const vals = pitchers
          .map((p) => getProjStat(p, cat.name, "pitching"))
          .filter((v) => v > 0);
        stats[cat.name] =
          vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      } else {
        stats[cat.name] = teamPlayers.reduce(
          (sum, p) => sum + getProjStat(p, cat.name, cat.type),
          0,
        );
      }
    }

    return { teamName, stats };
  });
}

// ─── Standings display helpers ────────────────────────────────────────────────

export function formatStatCell(catName: string, value: number): string {
  const n = catName.toUpperCase();
  if (n === "AVG" || n === "OBP" || n === "SLG") return value.toFixed(3);
  if (n === "ERA" || n === "WHIP") return value.toFixed(2);
  return String(Math.round(value));
}

export function rankColor(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.33) return "lo-rank-good";
  if (pct <= 0.66) return "lo-rank-mid";
  return "lo-rank-bad";
}

export function computeRanks(
  rows: ProjectedStandingsRow[],
  cat: string,
): Map<string, number> {
  const isLower = LOWER_IS_BETTER_CATS.has(cat.toUpperCase());
  const sorted = [...rows].sort((a, b) => {
    const av = a.stats[cat] ?? 0;
    const bv = b.stats[cat] ?? 0;
    // For lower-is-better stats, treat 0 as "no data" and push to the bottom
    if (isLower) {
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return av - bv;
    }
    return bv - av;
  });
  const ranks = new Map<string, number>();
  sorted.forEach((r, i) => ranks.set(r.teamName, i + 1));
  return ranks;
}
