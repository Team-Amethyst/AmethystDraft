/**
 * MLB catalog fetch + server-side cache keyed by position eligibility threshold.
 * Shared by GET /api/players and Engine valuation `position_overrides`.
 */
import { normalizeFantasyPosition, isPitchingPosition } from "./playerEligibility";
import { appendCatalogKindTestOverlay } from "./catalogKindTestOverlay";
import { UpstreamError } from "./appError";
import { mergeTwoWayPlayers, type PlayerData } from "./playerCatalog";
import {
  buildBatterFromSplit,
  buildPitcherFromSplit,
  fetchFortyManStatusByPlayerId,
  fetchPlayerBios,
  filterCatalogPlayersForExport,
  supplementCatalogFromFortyMan,
  type CatalogBuildContext,
  type MlbStatSplit,
} from "./catalogRosterSupplement";

const MLB_API = "https://statsapi.mlb.com/api/v1";

const SERVER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
type CachedPlayerList = { players: PlayerData[]; fetchedAt: number };
const serverPlayerCache = new Map<number, CachedPlayerList>();

/**
 * Returns the same processed catalog as GET /api/players (post export filter, pre pool filter).
 * Uses in-memory cache per threshold to avoid duplicate MLB traffic from valuations + UI refreshes.
 */
export async function getOrRefreshCatalogPlayers(
  threshold: number,
): Promise<PlayerData[]> {
  const cached = serverPlayerCache.get(threshold);
  if (cached && Date.now() - cached.fetchedAt < SERVER_CACHE_TTL_MS) {
    return appendCatalogKindTestOverlay(cached.players);
  }
  return fetchCatalogPlayersFromMlb(threshold);
}

async function fetchCatalogPlayersFromMlb(threshold: number): Promise<PlayerData[]> {
  const currentYear = new Date().getFullYear();
  const season = currentYear - 1; // last completed season
  const season2 = season - 1;
  const season3 = season - 2;

  const fortyManStatusByPid = await fetchFortyManStatusByPlayerId(currentYear);

  const responses = await Promise.all([
    fetch(
      `${MLB_API}/stats?stats=season&group=hitting&season=${season}&playerPool=ALL&limit=400&sportId=1`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=pitching&season=${season}&playerPool=ALL&limit=300&sportId=1`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=hitting&season=${season2}&playerPool=ALL&limit=400&sportId=1`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=pitching&season=${season2}&playerPool=ALL&limit=300&sportId=1`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=hitting&season=${season3}&playerPool=ALL&limit=400&sportId=1`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=pitching&season=${season3}&playerPool=ALL&limit=300&sportId=1`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=hitting&season=${currentYear}&playerPool=ALL&limit=400&sportId=1&gameType=S`,
    ),
    fetch(
      `${MLB_API}/stats?stats=season&group=pitching&season=${currentYear}&playerPool=ALL&limit=300&sportId=1&gameType=S`,
    ),
  ]);

  const failed = responses.filter((r) => !r.ok);
  if (failed.length > 0) {
    if (failed.some((r) => r.status === 429)) {
      console.warn(`MLB API rate limited: ${failed.length} requests failed`);
    }
    throw new UpstreamError(
      "MLB stats API request failed",
      502,
      "MLB_API_ERROR",
      failed.map((r) => ({ url: r.url, status: r.status, statusText: r.statusText })),
    );
  }

  const [
    batRes,
    pitRes,
    bat2Res,
    pit2Res,
    bat3Res,
    pit3Res,
    batSpringRes,
    pitSpringRes,
  ] = responses;

  const parseSplits = async (
    res: globalThis.Response,
  ): Promise<MlbStatSplit[]> => {
    try {
      const j = (await res.json()) as unknown as {
        stats: { splits: MlbStatSplit[] }[];
      };
      return j.stats?.[0]?.splits ?? [];
    } catch {
      return [];
    }
  };

  const [
    batSplits,
    pitSplits,
    bat2Splits,
    pit2Splits,
    bat3Splits,
    pit3Splits,
    batSpringSplits,
    pitSpringSplits,
  ] = await Promise.all([
    parseSplits(batRes),
    parseSplits(pitRes),
    parseSplits(bat2Res),
    parseSplits(pit2Res),
    parseSplits(bat3Res),
    parseSplits(pit3Res),
    parseSplits(batSpringRes),
    parseSplits(pitSpringRes),
  ]);

  const buildStatMap = (splits: MlbStatSplit[]) =>
    new Map(splits.map((s) => [s.player.id, s.stat]));
  const bat2Map = buildStatMap(bat2Splits);
  const bat3Map = buildStatMap(bat3Splits);
  const pit2Map = buildStatMap(pit2Splits);
  const pit3Map = buildStatMap(pit3Splits);
  const batSpringMap = buildStatMap(batSpringSplits);
  const pitSpringMap = buildStatMap(pitSpringSplits);

  const leaderboardIds = [
    ...new Set([
      ...batSplits.map((s) => s.player.id),
      ...pitSplits.map((s) => s.player.id),
    ]),
  ];
  const unionBioIds = [
    ...new Set([...leaderboardIds, ...fortyManStatusByPid.keys()]),
  ];
  const bioMap = await fetchPlayerBios(unionBioIds);

  const FIELDING_QUALIFY_GAMES = threshold;
  const posEligibilityMap = new Map<number, string[]>();
  try {
    const fieldRes = await fetch(
      `${MLB_API}/stats?stats=season&group=fielding&season=${season}&playerPool=ALL&limit=3000&sportId=1`,
    );
    const fieldJson = (await fieldRes.json()) as {
      stats: { splits: MlbStatSplit[] }[];
    };
    for (const s of fieldJson.stats?.[0]?.splits ?? []) {
      if (Number(s.stat.games ?? 0) < FIELDING_QUALIFY_GAMES) continue;
      const pid = s.player.id;
      const pos = normalizeFantasyPosition(
        s.position?.abbreviation ?? "OF",
        isPitchingPosition(s.position?.abbreviation ?? "") ? "pitching" : "hitting",
      );
      const existing = posEligibilityMap.get(pid) ?? [];
      if (!existing.includes(pos)) existing.push(pos);
      posEligibilityMap.set(pid, existing);
    }
  } catch {
    /* best-effort */
  }

  const ctx: CatalogBuildContext = {
    season,
    bat2Map,
    bat3Map,
    pit2Map,
    pit3Map,
    batSpringMap,
    pitSpringMap,
    posEligibilityMap,
    fortyManStatusByPid,
    bioMap,
  };

  const batters: PlayerData[] = [];
  for (const s of batSplits) {
    const row = buildBatterFromSplit(s, ctx);
    if (row) batters.push(row);
  }

  const pitchers: PlayerData[] = [];
  for (const s of pitSplits) {
    const row = buildPitcherFromSplit(s, ctx);
    if (row) pitchers.push(row);
  }

  const deduped = mergeTwoWayPlayers([...batters, ...pitchers]);
  const existingByMlbId = new Set(deduped.map((p) => p.mlbId));

  const rosterSupplement = await supplementCatalogFromFortyMan({
    existingByMlbId,
    fortyManStatusByPid,
    ctx,
    bioMap,
  });

  const merged = mergeTwoWayPlayers([...deduped, ...rosterSupplement]);
  const exportFiltered = filterCatalogPlayersForExport(merged);
  const withKindOverlay = appendCatalogKindTestOverlay(exportFiltered);
  serverPlayerCache.set(threshold, {
    players: withKindOverlay,
    fetchedAt: Date.now(),
  });

  return withKindOverlay;
}
