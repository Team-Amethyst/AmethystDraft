/**
 * 40-man roster union helpers for catalog ingestion.
 * Keeps catalog coverage separate from Engine valuation eligibility.
 */
import {
  isPitchingPosition,
  normalizeFantasyPosition,
  resolveEligiblePositions,
} from "./playerEligibility";
import {
  assignTier,
  calcAge,
  calcBatterValue,
  calcPitcherValue,
  equalWeightThreeYearBatting,
  equalWeightThreeYearPitching,
  projectBatting,
  projectPitching,
} from "./playerScoring";
import { teamAbbrev } from "./mlbTeams";
import type { PlayerData } from "./playerCatalog";
import {
  injurySeverityFrom40ManStatus,
  injuryStatusDisplayFrom40ManStatus,
} from "./injuryNormalize";

export const MLB_TEAM_IDS = [
  108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 133,
  134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
] as const;

/** Audit targets from depth-chart catalog gap investigation. */
export const CATALOG_RECOVERY_MLB_IDS = [
  683011, // Anthony Volpe
  669224, // Austin Wells
  701542, // Will Warren
  666808, // Camilo Doval
  518585, // Fernando Cruz
  682987, // Spencer Jones
] as const;

const MLB_API = "https://statsapi.mlb.com/api/v1";
const PEOPLE_HYDRATE_CHUNK = 40;
const BIO_CHUNK = 100;

export interface MlbPlayerBio {
  id: number;
  fullName: string;
  currentTeam?: { id: number; abbreviation?: string };
  primaryPosition?: { abbreviation: string };
  birthDate?: string;
}

export interface Mlb40ManStatus {
  code: string;
  description: string;
}

export interface MlbStatSplit {
  player: { id: number; fullName: string };
  team?: { id: number; abbreviation?: string };
  position?: { abbreviation: string };
  stat: Record<string, string | number>;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function meetsBatterValuationThreshold(
  stat: Record<string, string | number>,
): boolean {
  return Number(stat.atBats ?? 0) >= 100;
}

export function meetsPitcherValuationThreshold(
  stat: Record<string, string | number>,
): boolean {
  return (
    parseFloat(String(stat.inningsPitched ?? "0")) >= 20 ||
    Number(stat.saves ?? 0) >= 5
  );
}

/**
 * Catalog API export: keep valuation-eligible players with positive model value,
 * and all catalog-only rows (40-man / roster context without model inputs).
 */
export function filterCatalogPlayersForExport(
  players: PlayerData[],
): PlayerData[] {
  return players.filter((p) => p.valuation_eligible === false || p.value > 0);
}

export async function fetchFortyManStatusByPlayerId(
  currentYear: number,
): Promise<Map<number, Mlb40ManStatus>> {
  const fortyManStatusByPid = new Map<number, Mlb40ManStatus>();
  try {
    const rosterResults = await Promise.all(
      MLB_TEAM_IDS.map((id) =>
        fetch(
          `${MLB_API}/teams/${id}/roster?rosterType=40Man&season=${currentYear}`,
        ).then(
          (r) =>
            r.json() as Promise<{
              roster?: Array<{
                person?: { id?: number };
                status?: { code?: string; description?: string };
              }>;
            }>,
        ),
      ),
    );
    for (const rj of rosterResults) {
      for (const entry of rj.roster ?? []) {
        const pid = entry.person?.id;
        if (!pid) continue;
        const code = entry.status?.code ?? "";
        const description =
          entry.status?.description ?? entry.status?.code ?? "";
        fortyManStatusByPid.set(pid, { code, description });
      }
    }
  } catch {
    /* best-effort */
  }
  return fortyManStatusByPid;
}

export async function fetchPlayerBios(
  personIds: number[],
): Promise<Map<number, MlbPlayerBio>> {
  const bioMap = new Map<number, MlbPlayerBio>();
  const unique = [...new Set(personIds)];
  for (const chunk of chunkArray(unique, BIO_CHUNK)) {
    if (chunk.length === 0) continue;
    try {
      const bioRes = await fetch(
        `${MLB_API}/people?personIds=${chunk.join(",")}&hydrate=currentTeam`,
      );
      if (!bioRes.ok) continue;
      const bioJson = (await bioRes.json()) as { people: MlbPlayerBio[] };
      for (const p of bioJson.people ?? []) bioMap.set(p.id, p);
    } catch {
      /* best-effort */
    }
  }
  return bioMap;
}

interface PersonHydrateStatGroup {
  group?: { displayName?: string };
  splits?: Array<{
    season?: string;
    stat?: Record<string, string | number>;
    team?: { id: number; abbreviation?: string };
    position?: { abbreviation: string };
  }>;
}

interface PersonHydrateRow {
  id?: number;
  fullName?: string;
  birthDate?: string;
  primaryPosition?: { abbreviation: string };
  currentTeam?: { id: number; abbreviation?: string };
  stats?: PersonHydrateStatGroup[];
}

export function seasonStatSplitFromPerson(
  person: PersonHydrateRow,
  group: "hitting" | "pitching",
  season: number,
): MlbStatSplit | undefined {
  const pid = person.id;
  if (!pid) return undefined;
  for (const statGroup of person.stats ?? []) {
    const name = (statGroup.group?.displayName ?? "").toLowerCase();
    if (name !== group) continue;
    for (const split of statGroup.splits ?? []) {
      if (String(split.season ?? "") !== String(season)) continue;
      const stat = split.stat ?? {};
      return {
        player: { id: pid, fullName: person.fullName ?? "" },
        team: split.team,
        position: split.position,
        stat,
      };
    }
  }
  return undefined;
}

export interface CatalogBuildContext {
  season: number;
  bat2Map: Map<number, Record<string, string | number>>;
  bat3Map: Map<number, Record<string, string | number>>;
  pit2Map: Map<number, Record<string, string | number>>;
  pit3Map: Map<number, Record<string, string | number>>;
  batSpringMap: Map<number, Record<string, string | number>>;
  pitSpringMap: Map<number, Record<string, string | number>>;
  posEligibilityMap: Map<number, string[]>;
  fortyManStatusByPid: Map<number, Mlb40ManStatus>;
  bioMap: Map<number, MlbPlayerBio>;
}

function headshotUrl(pid: number): string {
  return (
    "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/" +
    pid +
    "/headshot/67/current"
  );
}

export function buildBatterFromSplit(
  s: MlbStatSplit,
  ctx: CatalogBuildContext,
  options?: { forceCatalogOnly?: boolean },
): PlayerData | null {
  const stat = s.stat;
  const pid = s.player.id;
  const qualifies = meetsBatterValuationThreshold(stat);
  if (!qualifies && !options?.forceCatalogOnly) return null;

  const bio = ctx.bioMap.get(pid);
  const value = qualifies ? calcBatterValue(stat) : 0;
  const valuationEligible = qualifies && value > 0 && !options?.forceCatalogOnly;
  const springStat = ctx.batSpringMap.get(pid);
  const fm = ctx.fortyManStatusByPid.get(pid);
  const injurySeverity = fm
    ? injurySeverityFrom40ManStatus(fm.code, fm.description)
    : 0;

  return {
    id: String(pid),
    mlbId: pid,
    catalog_kind: "valuation_eligible",
    valuation_eligible: valuationEligible,
    name: s.player.fullName,
    team: teamAbbrev(s.team, bio?.currentTeam),
    position: normalizeFantasyPosition(
      s.position?.abbreviation ?? bio?.primaryPosition?.abbreviation ?? "OF",
      "hitting",
    ),
    positions: resolveEligiblePositions(
      ctx.posEligibilityMap.get(pid),
      s.position?.abbreviation ?? bio?.primaryPosition?.abbreviation ?? "OF",
      "hitting",
    ),
    age: calcAge(bio?.birthDate),
    catalog_rank: 0,
    value,
    catalog_tier: assignTier(value),
    headshot: headshotUrl(pid),
    stats: qualifies
      ? {
          batting: {
            avg: String(stat.avg ?? ".000"),
            hr: Number(stat.homeRuns ?? 0),
            rbi: Number(stat.rbi ?? 0),
            runs: Number(stat.runs ?? 0),
            sb: Number(stat.stolenBases ?? 0),
            obp: String(stat.obp ?? ".000"),
            slg: String(stat.slg ?? ".000"),
          },
        }
      : {},
    projection: qualifies
      ? {
          batting: projectBatting(stat, ctx.bat2Map.get(pid), ctx.bat3Map.get(pid)),
        }
      : {},
    stats3yr: qualifies
      ? {
          batting: equalWeightThreeYearBatting(
            stat,
            ctx.bat2Map.get(pid),
            ctx.bat3Map.get(pid),
          ),
        }
      : undefined,
    outlook: "",
    injuryStatus: fm
      ? injuryStatusDisplayFrom40ManStatus(fm.code, fm.description)
      : undefined,
    injurySeverity,
    springStats:
      springStat && Number(springStat.atBats ?? 0) >= 5
        ? {
            batting: {
              avg: String(springStat.avg ?? ".000"),
              hr: Number(springStat.homeRuns ?? 0),
              rbi: Number(springStat.rbi ?? 0),
              runs: Number(springStat.runs ?? 0),
              sb: Number(springStat.stolenBases ?? 0),
              ab: Number(springStat.atBats ?? 0),
            },
          }
        : undefined,
  };
}

export function buildPitcherFromSplit(
  s: MlbStatSplit,
  ctx: CatalogBuildContext,
  options?: { forceCatalogOnly?: boolean },
): PlayerData | null {
  const stat = s.stat;
  const pid = s.player.id;
  const qualifies = meetsPitcherValuationThreshold(stat);
  if (!qualifies && !options?.forceCatalogOnly) return null;

  const bio = ctx.bioMap.get(pid);
  const value = qualifies ? calcPitcherValue(stat) : 0;
  const valuationEligible = qualifies && value > 0 && !options?.forceCatalogOnly;
  const springStat = ctx.pitSpringMap.get(pid);
  const fm = ctx.fortyManStatusByPid.get(pid);
  const injurySeverity = fm
    ? injurySeverityFrom40ManStatus(fm.code, fm.description)
    : 0;

  return {
    id: String(pid),
    mlbId: pid,
    catalog_kind: "valuation_eligible",
    valuation_eligible: valuationEligible,
    name: s.player.fullName,
    team: teamAbbrev(s.team, bio?.currentTeam),
    position: normalizeFantasyPosition(
      s.position?.abbreviation ?? bio?.primaryPosition?.abbreviation ?? "SP",
      "pitching",
    ),
    positions: resolveEligiblePositions(
      ctx.posEligibilityMap.get(pid),
      s.position?.abbreviation ?? bio?.primaryPosition?.abbreviation ?? "SP",
      "pitching",
    ),
    age: calcAge(bio?.birthDate),
    catalog_rank: 0,
    value,
    catalog_tier: assignTier(value),
    headshot: headshotUrl(pid),
    stats: qualifies
      ? {
          pitching: {
            era: String(stat.era ?? "0.00"),
            whip: String(stat.whip ?? "0.00"),
            wins: Number(stat.wins ?? 0),
            saves: Number(stat.saves ?? 0),
            holds: Number(stat.holds ?? 0),
            strikeouts: Number(stat.strikeOuts ?? 0),
            innings: String(stat.inningsPitched ?? "0"),
            completeGames: Number(stat.completeGames ?? 0),
          },
        }
      : {},
    projection: qualifies
      ? {
          pitching: projectPitching(stat, ctx.pit2Map.get(pid), ctx.pit3Map.get(pid)),
        }
      : {},
    stats3yr: qualifies
      ? {
          pitching: equalWeightThreeYearPitching(
            stat,
            ctx.pit2Map.get(pid),
            ctx.pit3Map.get(pid),
          ),
        }
      : undefined,
    outlook: "",
    injuryStatus: fm
      ? injuryStatusDisplayFrom40ManStatus(fm.code, fm.description)
      : undefined,
    injurySeverity,
    springStats:
      springStat &&
      parseFloat(String(springStat.inningsPitched ?? "0")) >= 1
        ? {
            pitching: {
              era: String(springStat.era ?? "0.00"),
              whip: String(springStat.whip ?? "0.00"),
              wins: Number(springStat.wins ?? 0),
              saves: Number(springStat.saves ?? 0),
              strikeouts: Number(springStat.strikeOuts ?? 0),
              innings: String(springStat.inningsPitched ?? "0"),
            },
          }
        : undefined,
  };
}

export function buildCatalogOnlyFromBio(
  pid: number,
  ctx: CatalogBuildContext,
): PlayerData | null {
  const bio = ctx.bioMap.get(pid);
  if (!bio?.fullName) return null;
  const fm = ctx.fortyManStatusByPid.get(pid);
  const injurySeverity = fm
    ? injurySeverityFrom40ManStatus(fm.code, fm.description)
    : 0;
  const rawPos = bio.primaryPosition?.abbreviation ?? "UTIL";
  const pitch = isPitchingPosition(rawPos);
  return {
    id: String(pid),
    mlbId: pid,
    catalog_kind: "valuation_eligible",
    valuation_eligible: false,
    name: bio.fullName,
    team: teamAbbrev(undefined, bio.currentTeam),
    position: normalizeFantasyPosition(rawPos, pitch ? "pitching" : "hitting"),
    positions: resolveEligiblePositions(
      ctx.posEligibilityMap.get(pid),
      rawPos,
      pitch ? "pitching" : "hitting",
    ),
    age: calcAge(bio.birthDate),
    catalog_rank: 0,
    value: 0,
    catalog_tier: assignTier(0),
    headshot: headshotUrl(pid),
    stats: {},
    projection: {},
    outlook: "",
    injuryStatus: fm
      ? injuryStatusDisplayFrom40ManStatus(fm.code, fm.description)
      : undefined,
    injurySeverity,
  };
}

export async function supplementCatalogFromFortyMan(params: {
  existingByMlbId: Set<number>;
  fortyManStatusByPid: Map<number, Mlb40ManStatus>;
  ctx: CatalogBuildContext;
  bioMap: Map<number, MlbPlayerBio>;
}): Promise<PlayerData[]> {
  const { existingByMlbId, fortyManStatusByPid, ctx, bioMap } = params;
  const missingIds = [...fortyManStatusByPid.keys()].filter(
    (id) => !existingByMlbId.has(id),
  );
  if (missingIds.length === 0) return [];

  const supplemental: PlayerData[] = [];
  const season = ctx.season;

  for (const chunk of chunkArray(missingIds, PEOPLE_HYDRATE_CHUNK)) {
    const hydrate = encodeURIComponent(
      `stats(group=[hitting,pitching],type=[season],season=${season},sportId=1)`,
    );
    try {
      const res = await fetch(
        `${MLB_API}/people?personIds=${chunk.join(",")}&hydrate=${hydrate}`,
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { people?: PersonHydrateRow[] };
      for (const person of data.people ?? []) {
        const pid = person.id;
        if (!pid || existingByMlbId.has(pid)) continue;

        const hitSplit = seasonStatSplitFromPerson(person, "hitting", season);
        const pitSplit = seasonStatSplitFromPerson(person, "pitching", season);
        const built: PlayerData[] = [];

        if (hitSplit) {
          const row = buildBatterFromSplit(hitSplit, ctx);
          if (row) built.push(row);
        }
        if (pitSplit) {
          const row = buildPitcherFromSplit(pitSplit, ctx);
          if (row) built.push(row);
        }

        if (built.length === 0) {
          const catalogOnly = buildCatalogOnlyFromBio(pid, ctx);
          if (catalogOnly) built.push(catalogOnly);
        }

        for (const row of built) {
          supplemental.push(row);
          existingByMlbId.add(pid);
        }
      }
    } catch {
      /* best-effort per chunk */
    }
  }

  const stillMissing = missingIds.filter((id) => !existingByMlbId.has(id));
  for (const pid of stillMissing) {
    if (!bioMap.has(pid)) continue;
    const catalogOnly = buildCatalogOnlyFromBio(pid, ctx);
    if (catalogOnly) {
      supplemental.push(catalogOnly);
      existingByMlbId.add(pid);
    }
  }

  return supplemental;
}
