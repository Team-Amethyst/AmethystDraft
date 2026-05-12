import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import {
  LOWER_IS_BETTER_CATS,
  normalizeCatName,
  ROTO_RATE_BATTING_CATEGORIES,
} from "./categories";

export interface ProjectedStandingsRow {
  teamName: string;
  stats: Record<string, number>;
}

export function getProjStat(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const n = normalizeCatName(catName).trim().toUpperCase();
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
  }

  const p = player.projection?.pitching ?? player.stats?.pitching;
  if (!p) return 0;
  if (n === "W" || n === "WINS") return p.wins;
  if (n === "K" || n === "SO") return p.strikeouts;
  if (n === "ERA") return parseFloat(String(p.era)) || 0;
  if (
    n === "WHIP" ||
    n === "WALKS + HITS PER IP" ||
    n === "W+H/IP" ||
    (n.includes("WHIP") && n.includes("IP"))
  )
    return parseFloat(String(p.whip)) || 0;
  if (n === "SV" || n === "SAVES") return p.saves;
  return 0;
}

export function teamBattingRatePaceForCategory(
  teamPlayers: Player[],
  catName: string,
): number {
  const batters = teamPlayers.filter(
    (p) => !!(p.projection?.batting ?? p.stats?.batting),
  );
  const weights = batters.map((p) => {
    const b = p.projection?.batting ?? p.stats?.batting;
    return (b?.hr ?? 0) + 1;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return 0;
  const weighted = batters.reduce(
    (sum, p, idx) => sum + getProjStat(p, catName, "batting") * weights[idx],
    0,
  );
  return weighted / totalWeight;
}

export function teamPitchingRatePaceForCategory(
  teamPlayers: Player[],
  catName: string,
): number {
  const pitchers = teamPlayers.filter(
    (p) => !!(p.projection?.pitching ?? p.stats?.pitching),
  );
  let weightedSum = 0;
  let totalIP = 0;
  for (const p of pitchers) {
    const rate = getProjStat(p, catName, "pitching");
    const ip =
      p.projection?.pitching?.innings ??
      parseFloat(String(p.stats?.pitching?.innings ?? "0"));
    if (rate > 0 && ip > 0) {
      weightedSum += rate * ip;
      totalIP += ip;
    }
  }
  if (totalIP > 0) return weightedSum / totalIP;
  const vals = pitchers
    .map((p) => getProjStat(p, catName, "pitching"))
    .filter((v) => v > 0);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

export function rotoCategoryAggregation(
  catName: string,
  catType: "batting" | "pitching",
): "lower" | "higher" | "sum" {
  const key = normalizeCatName(catName).trim().toUpperCase();
  if (catType === "pitching") return LOWER_IS_BETTER_CATS.has(key) ? "lower" : "sum";
  if (catType === "batting") return ROTO_RATE_BATTING_CATEGORIES.has(key) ? "higher" : "sum";
  return "sum";
}

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
      const n = normalizeCatName(cat.name).trim().toUpperCase();
      if (cat.type === "batting" && ROTO_RATE_BATTING_CATEGORIES.has(n)) {
        stats[cat.name] = teamBattingRatePaceForCategory(teamPlayers, cat.name);
      } else if (cat.type === "pitching" && LOWER_IS_BETTER_CATS.has(n)) {
        stats[cat.name] = teamPitchingRatePaceForCategory(teamPlayers, cat.name);
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

/** True when `formatStatCell` shows an em dash (no projected stat yet). */
export function isStatCellEmpty(value: number): boolean {
  return value === 0;
}

export function formatStatCell(catName: string, value: number): string {
  if (value === 0) return "\u2014";
  const n = normalizeCatName(catName).trim().toUpperCase();
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
  const isLower = LOWER_IS_BETTER_CATS.has(normalizeCatName(cat).trim().toUpperCase());
  const sorted = [...rows].sort((a, b) => {
    const av = a.stats[cat] ?? 0;
    const bv = b.stats[cat] ?? 0;
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
