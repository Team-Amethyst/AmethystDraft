import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";
import { getEligibleSlotsForPositions, getEligibleSlotsForPosition } from "../utils/eligibility";
import { getEffectiveTierValue, type TierValueOverride } from "../utils/effectiveTierValue";

/** Extracts the abbreviation from labels like "Walks + Hits per IP (WHIP)" → "WHIP" */
export function normalizeCatName(name: string): string {
  const m = name.match(/\(([^)]+)\)$/);
  return m ? m[1] : name;
}

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
  const name = normalizeCatName(catName).trim().toUpperCase();
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
    if (
      name === "WHIP" ||
      name === "WALKS + HITS PER IP" ||
      name === "W+H/IP" ||
      (name.includes("WHIP") && name.includes("IP"))
    )
      return parseFloat(p.whip) || 0;
    if (name === "SV" || name === "SAVES") return p.saves;
    if (name === "IP") return parseFloat(p.innings) || 0;
    return 0;
  }
}

/** Mirrors API engineContext: auction board picks only (excludes keepers, minors, taxi). */
export function isEngineAuctionBoardEntry(entry: RosterEntry): boolean {
  if (entry.isKeeper) return false;
  const slot = (entry.rosterSlot ?? "").toUpperCase();
  if (slot.includes("MIN")) return false;
  if (slot.includes("TAXI")) return false;
  return true;
}

/** Per-team roster slots from league settings (same basis as engine roster_slot_count_sum). */
export function rosterSlotsPerTeam(league: League): number {
  return Object.values(league.rosterSlots).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );
}

/** League-wide auction slots still empty (pre-draft or in-draft), excluding keepers/minors/taxi rows. */
export function leagueWideAuctionSlotsRemaining(
  league: League,
  entries: RosterEntry[],
): number {
  const cap = rosterSlotsPerTeam(league) * league.teams;
  const onBoard = entries.filter(isEngineAuctionBoardEntry).length;
  return Math.max(0, cap - onBoard);
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
  tierValueOverrides?: ReadonlyMap<string, TierValueOverride>,
): PositionMarket | null {
  if (!position || allPlayers.length === 0) return null;
  // Include any player with this position in their multi-position eligibility array
  const posPlayers = allPlayers.filter(
    (p) => p.position === position || p.positions?.includes(position),
  );
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
    ? Math.round(
        remaining.reduce(
          (s, p) =>
            s +
            getEffectiveTierValue(
              p.id,
              { tier: p.tier, value: p.value },
              tierValueOverrides,
            ).value,
          0,
        ) / remaining.length,
      )
    : 0;
  const inflation =
    avgWinPrice > 0 && avgProjValue > 0
      ? Math.round((avgWinPrice / avgProjValue - 1) * 100)
      : 0;

  const allTiers = [
    ...new Set(
      remaining.map(
        (p) =>
          getEffectiveTierValue(
            p.id,
            { tier: p.tier, value: p.value },
            tierValueOverrides,
          ).tier,
      ),
    ),
  ].sort(
    (a, b) => a - b,
  );
  const avgOrNull = (arr: Player[]) =>
    arr.length
      ? Math.round(
          arr.reduce(
            (s, p) =>
              s +
              getEffectiveTierValue(
                p.id,
                { tier: p.tier, value: p.value },
                tierValueOverrides,
              ).value,
            0,
          ) / arr.length,
        )
      : null;

  return {
    position,
    avgWinPrice,
    avgProjValue,
    inflation,
    supply: allTiers.map((tier) => {
      const arr = remaining.filter(
        (p) =>
          getEffectiveTierValue(
            p.id,
            { tier: p.tier, value: p.value },
            tierValueOverrides,
          ).tier === tier,
      );
      return { tier, count: arr.length, avgVal: avgOrNull(arr) };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Team eligibility helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getEligibleSlots(pos: string, slots: string[]): string[] {
  return getEligibleSlotsForPosition(pos, slots);
}

export function teamCanBid(
  teamName: string,
  positions: string[],
  league: League,
  rosterEntries: RosterEntry[],
): boolean {
  if (positions.length === 0) return true;
  const allSlots = Object.keys(league.rosterSlots);
  const eligible = getEligibleSlotsForPositions(positions, allSlots);
  if (eligible.length === 0) return false;
  const teamIdx = league.teamNames.indexOf(teamName);
  if (teamIdx === -1) return false;
  const teamId = `team_${teamIdx + 1}`;
  const teamRoster = rosterEntries.filter((e) => e.teamId === teamId);
  const filled = new Map<string, number>();
  teamRoster.forEach((e) => {
    filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1);
  });
  return eligible.some(
    (s) => (filled.get(s) ?? 0) < (league.rosterSlots[s] ?? 1),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Projected standings
// ─────────────────────────────────────────────────────────────────────────────

export const LOWER_IS_BETTER_CATS = new Set([
  "ERA",
  "WHIP",
  "WALKS + HITS PER IP",
  "W+H/IP",
]);

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
  } else {
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
}

/** Batting rate categories aggregated as a weighted average (matches projected standings). */
export const ROTO_RATE_BATTING_CATEGORIES = new Set(["AVG", "OBP", "SLG"]);

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

/** IP-weighted ERA/WHIP-style pace for a roster (same basis as projected standings). */
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
  if (catType === "pitching") {
    return LOWER_IS_BETTER_CATS.has(key) ? "lower" : "sum";
  }
  if (catType === "batting") {
    return ROTO_RATE_BATTING_CATEGORIES.has(key) ? "higher" : "sum";
  }
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
        stats[cat.name] = teamPitchingRatePaceForCategory(
          teamPlayers,
          cat.name,
        );
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
  const isLower = LOWER_IS_BETTER_CATS.has(
    normalizeCatName(cat).trim().toUpperCase(),
  );
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
