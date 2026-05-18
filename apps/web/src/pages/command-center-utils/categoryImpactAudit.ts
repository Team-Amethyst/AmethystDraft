/**
 * Category / roto impact formula audit helpers.
 * Used by tests and scripts/category-impact-audit.mts — not imported by production UI.
 */
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import {
  auctionCenterCategoryImpactRows,
  rotoPointsDeltaForTeamInCategory,
  type AuctionCenterCategoryImpactContext,
} from "./categoryImpactRows";
import {
  buildProjectedStandings,
  computeRanks,
  getProjStat,
  teamBattingRatePaceForCategory,
  teamPitchingRatePaceForCategory,
} from "./standings";
import { normalizeCatName } from "./categories";

export const CATEGORY_IMPACT_FORMULAS = {
  counting:
    "team total = Σ getProjStat(player, cat); with-player = team + selected player stat",
  eraWhip:
    "team rate = Σ(rate_i × IP_i) / Σ(IP_i) when IP > 0; equals 9×ΣER/ΣIP and Σ(BB+H)/ΣIP when rate_i = 9×ER_i/IP_i and WHIP_i = (BB+H)_i/IP_i",
  eraWhipNoIpFallback:
    "when Σ(IP)=0 for pitchers on team: unweighted arithmetic mean of pitcher rates (edge case)",
  avg:
    "team AVG = ΣH / ΣAB when H or avg×AB available per player; else HR-weighted mean of player AVG",
  obpSlg:
    "OBP/SLG (non-AVG batting rates): HR-weighted mean of player rates — not true Σ(numerator)/Σ(denominator) unless PA components exist",
  rotoPoints:
    "points(rank) = numTeams - rank + 1; delta = points(after) - points(before) on buildProjectedStandings league-wide",
  displayVsSim:
    "category cards: before/after use myTeam active roster; roto sim uses all teams’ active rosters + hypothetical BN add",
} as const;

export function pitcherInnings(player: Player): number {
  return (
    player.projection?.pitching?.innings ??
    parseFloat(String(player.stats?.pitching?.innings ?? "0")) ??
    0
  );
}

/** ERA from derived ER = ERA×IP/9 — should match teamPitchingRatePaceForCategory when IP > 0. */
export function teamEraFromDerivedEarnedRuns(players: Player[]): number {
  let er = 0;
  let ip = 0;
  for (const p of players) {
    const rate = getProjStat(p, "ERA", "pitching");
    const innings = pitcherInnings(p);
    if (innings > 0 && Number.isFinite(rate)) {
      er += (rate * innings) / 9;
      ip += innings;
    }
  }
  return ip > 0 ? (9 * er) / ip : 0;
}

/** WHIP from derived baserunners = WHIP×IP — should match teamPitchingRatePaceForCategory when IP > 0. */
export function teamWhipFromDerivedBaserunners(players: Player[]): number {
  let bbH = 0;
  let ip = 0;
  for (const p of players) {
    const rate = getProjStat(p, "WHIP", "pitching");
    const innings = pitcherInnings(p);
    if (innings > 0 && Number.isFinite(rate)) {
      bbH += rate * innings;
      ip += innings;
    }
  }
  return ip > 0 ? bbH / ip : 0;
}

export function teamAvgFromHitsAb(players: Player[]): number {
  let h = 0;
  let ab = 0;
  for (const p of players) {
    const proj = p.projection?.batting as
      | { avg?: string; ab?: number; hits?: number; h?: number }
      | undefined;
    const st = p.stats?.batting as
      | { avg?: string; ab?: number; hits?: number; h?: number }
      | undefined;
    const inningsAb = proj?.ab ?? st?.ab ?? 0;
    const hits = proj?.hits ?? proj?.h ?? st?.hits ?? st?.h;
    if (inningsAb > 0 && hits != null && Number.isFinite(hits)) {
      h += Number(hits);
      ab += inningsAb;
      continue;
    }
    const avgStr = proj?.avg ?? st?.avg;
    const avg = typeof avgStr === "string" ? parseFloat(avgStr) : Number(avgStr);
    if (inningsAb > 0 && Number.isFinite(avg) && avg > 0) {
      h += avg * inningsAb;
      ab += inningsAb;
    }
  }
  return ab > 0 ? h / ab : 0;
}

export interface CategoryImpactAuditRow {
  category: string;
  teamBefore: string;
  teamAfter: string;
  rotoPtsLine: string | null;
  rankBefore: number | null;
  rankAfter: number | null;
  rotoDelta: number | null;
}

export function auditCategoryImpactForPlayer(input: {
  selectedPlayer: Player;
  scoringCategories: { name: string; type: "batting" | "pitching" }[];
  statView: "hitting" | "pitching";
  myTeamEntries: RosterEntry[];
  allPlayers: Player[];
  rosterImpact: AuctionCenterCategoryImpactContext;
}): CategoryImpactAuditRow[] {
  const rows = auctionCenterCategoryImpactRows(input);
  const catKeys = rows.map((r) => normalizeCatName(r.name));
  const playerMap = new Map(input.allPlayers.map((p) => [p.id, p]));
  const categories = input.scoringCategories
    .filter((c) =>
      input.statView === "pitching" ? c.type === "pitching" : c.type === "batting",
    )
    .map((c) => ({ name: normalizeCatName(c.name), type: c.type }));

  const base = buildProjectedStandings(
    input.rosterImpact.leagueTeamNames,
    input.rosterImpact.fullRosterEntries,
    playerMap,
    categories,
  );
  const hypo = [
    ...input.rosterImpact.fullRosterEntries,
    {
      _id: `audit:${input.selectedPlayer.id}`,
      leagueId: input.rosterImpact.leagueId,
      userId: input.rosterImpact.userId,
      teamId: input.rosterImpact.myTeamId,
      externalPlayerId: input.selectedPlayer.id,
      playerName: input.selectedPlayer.name,
      playerTeam: input.selectedPlayer.team,
      positions: input.selectedPlayer.positions ?? [input.selectedPlayer.position],
      price: 0,
      rosterSlot: "BN",
      isKeeper: false,
      acquiredAt: "",
      createdAt: "",
    } satisfies RosterEntry,
  ];
  const withP = buildProjectedStandings(
    input.rosterImpact.leagueTeamNames,
    hypo,
    playerMap,
    categories,
  );
  const n = input.rosterImpact.leagueTeamNames.length;
  const myName = input.rosterImpact.myTeamName;

  return rows.map((row, i) => {
    const key = catKeys[i] ?? normalizeCatName(row.name);
    const rb = computeRanks(base, key).get(myName) ?? null;
    const ra = computeRanks(withP, key).get(myName) ?? null;
    const delta = rotoPointsDeltaForTeamInCategory(base, withP, myName, key, n);
    return {
      category: row.name,
      teamBefore: row.teamPaceStr,
      teamAfter: row.withPlayerStr,
      rotoPtsLine: row.rotoPtsLine,
      rankBefore: rb,
      rankAfter: ra,
      rotoDelta: delta,
    };
  });
}

/** Fixture approximating Will Warren category-impact screenshot (IP-weighted ERA/WHIP). */
export function buildWillWarrenAuditFixture(): {
  myPitchers: Player[];
  warren: Player;
  leaguePitchers: { teamName: string; whip: number }[];
} {
  const mkPitcher = (
    id: string,
    era: number,
    whip: number,
    ip: number,
    k: number,
    wins: number,
  ): Player =>
    ({
      id,
      mlbId: Number(id.replace(/\D/g, "") || 1),
      name: id,
      team: "TST",
      position: "SP",
      age: 26,
      catalog_rank: 50,
      value: 10,
      catalog_tier: 3,
      headshot: "",
      outlook: "",
      stats: {
        pitching: {
          era: String(era),
          whip: String(whip),
          wins,
          saves: 0,
          holds: 0,
          strikeouts: k,
          innings: String(ip),
          completeGames: 0,
        },
      },
      projection: {
        pitching: {
          era: String(era),
          whip: String(whip),
          wins,
          saves: 0,
          holds: 0,
          strikeouts: k,
          innings: ip,
          completeGames: 0,
        },
      },
    }) as Player;

  const p1 = mkPitcher("p1", 3.72, 1.05, 250, 320, 18);
  const p2 = mkPitcher("p2", 3.84, 1.14, 280, 294, 22);
  const warren = mkPitcher("warren", 4.31, 1.35, 170, 171, 9);
  const leaguePitchers = [
    { teamName: "Rival A", whip: 1.08 },
    { teamName: "Rival B", whip: 1.09 },
    { teamName: "Rival C", whip: 1.11 },
    { teamName: "Rival D", whip: 1.12 },
  ];
  return { myPitchers: [p1, p2], warren, leaguePitchers };
}

export {
  teamBattingRatePaceForCategory,
  teamPitchingRatePaceForCategory,
  getProjStat,
};
