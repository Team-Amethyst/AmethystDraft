import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { AxiosError } from "axios";
import {
  isPitchingPosition,
  normalizeFantasyPosition,
  resolveEligiblePositions,
} from "../lib/playerEligibility";
import { validateBody, validateQuery } from "../validation/validate";
import { playersQuerySchema } from "../validation/schemas";
import {
  valuationIncomingSchema,
  type ValuationIncomingParsed,
} from "../validation/valuationRequestSchema";
import {
  finalizeEngineValuationPostPayload,
  valuationIncomingToEngineContext,
} from "../lib/engineContext";
import { amethyst } from "../lib/amethyst";
import { forwardEngineCorrelationHeaders } from "../lib/engineResponseMeta";
import { playerApiTestKeyAuth } from "../middleware/playerApiTestKeyAuth";
import {
  assignTier,
  calcAge,
  calcBatterValue,
  calcPitcherValue,
  projectBatting,
  projectPitching,
} from "../lib/playerScoring";
import { teamAbbrev } from "../lib/mlbTeams";
import {
  applyAdpByValue,
  filterByPlayerPool,
  mergeTwoWayPlayers,
  sortPlayers,
  type PlayerData,
} from "../lib/playerCatalog";
import { AppError, UpstreamError } from "../lib/appError";

const router: Router = Router();

// ─── Server-side MLB data cache ───────────────────────────────────────────────
// The 40 MLB API calls are expensive; data changes at most once per day.
// Cache the processed (pre-pool-filter) player list per posEligibilityThreshold
// so subsequent requests within the TTL skip all fetching entirely.
const SERVER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
type CachedPlayerList = { players: PlayerData[]; fetchedAt: number };
const serverPlayerCache = new Map<number, CachedPlayerList>();

// ─── MLB Stats API helpers ────────────────────────────────────────────────────

const MLB_API = "https://statsapi.mlb.com/api/v1";

interface MlbPlayer {
  id: number;
  fullName: string;
  currentTeam?: { id: number; abbreviation?: string };
  primaryPosition?: { abbreviation: string };
  birthDate?: string;
}

interface RosterEntry {
  person: { id: number; fullName: string };
  position?: { abbreviation?: string };
  status?: { code: string; description: string };
}

interface MlbStatSplit {
  player: { id: number; fullName: string };
  team?: { id: number; abbreviation?: string };
  position?: { abbreviation: string };
  stat: Record<string, string | number>;
}

type DepthChartPosition =
  | "SP"
  | "RP"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "CF"
  | "RF"
  | "DH";

interface ActiveRosterResponse {
  roster?: Array<{
    person?: { id?: number; fullName?: string };
    position?: { abbreviation?: string };
    status?: { code?: string; description?: string };
  }>;
}

interface ScheduleResponse {
  dates?: Array<{
    games?: Array<{ gamePk?: number }>;
  }>;
}

interface BoxScorePlayer {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string };
  stats?: {
    batting?: {
      battingOrder?: string;
      gamesStarted?: number | string;
    };
    pitching?: {
      gamesStarted?: number | string;
      inningsPitched?: string;
    };
  };
}

interface BoxScoreResponse {
  teams?: {
    home?: { players?: Record<string, BoxScorePlayer> };
    away?: { players?: Record<string, BoxScorePlayer> };
  };
}

interface PeopleResponse {
  people?: Array<{
    id?: number;
    stats?: Array<{
      splits?: Array<{
        position?: { abbreviation?: string };
        stat?: { games?: number | string };
      }>;
    }>;
  }>;
}

interface DepthUsage {
  appearances: number;
  starts: number;
  startsByPosition: Map<string, number>;
  appearancesByPosition: Map<string, number>;
}

interface DepthChartPlayer {
  rank: 1 | 2 | 3;
  playerId: number;
  playerName: string;
  primaryPosition: string;
  status: string;
  usageStarts: number;
  usageAppearances: number;
  outOfPosition: boolean;
  needsManualReview: boolean;
  reasons: string[];
}

interface DepthChartResponse {
  teamId: number;
  generatedAt: string;
  season: number;
  rosterCount: number;
  rosterLimit: 26 | 28;
  positions: Record<DepthChartPosition, DepthChartPlayer[]>;
  manualReview: Array<{
    playerId: number;
    playerName: string;
    requestedPosition: DepthChartPosition;
    reason: string;
  }>;
}

const DEPTH_POSITIONS: DepthChartPosition[] = [
  "SP",
  "RP",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
];

const DEPTH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const depthChartCache = new Map<string, { fetchedAt: number; payload: DepthChartResponse }>();

function mapPositionSlot(position: string): string {
  const normalized = position.toUpperCase();
  if (normalized === "P") return "SP";
  if (normalized === "OF") return "LF";
  if (normalized === "UT" || normalized === "UTIL") return "DH";
  return normalized;
}

function isAvailableRosterStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  if (!normalized) return true;
  const unavailableTokens = [
    "injured",
    "injury",
    "bereavement",
    "restricted",
    "suspended",
    "paternity",
    "inactive",
    "temporarily inactive",
    "covid",
    "il",
  ];
  return !unavailableTokens.some((token) => normalized.includes(token));
}

function incrementMapCount(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function parseStarts(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new UpstreamError("MLB API request failed", 502, "MLB_DEPTH_CHART_ERROR", {
      url,
      status: response.status,
      statusText: response.statusText,
    });
  }
  return (await response.json()) as T;
}

function safeDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function scoreCandidate(
  targetPosition: DepthChartPosition,
  primaryPosition: string,
  usage: DepthUsage,
  secondaryPositions: Set<string>,
): { score: number; outOfPosition: boolean; reasons: string[] } {
  const mappedPrimary = mapPositionSlot(primaryPosition);
  const mappedTarget = mapPositionSlot(targetPosition);

  const startsAtPosition =
    usage.startsByPosition.get(targetPosition) ??
    usage.startsByPosition.get(mappedTarget) ??
    0;
  const appearancesAtPosition =
    usage.appearancesByPosition.get(targetPosition) ??
    usage.appearancesByPosition.get(mappedTarget) ??
    0;

  const primaryMatch = mappedPrimary === mappedTarget;
  const secondaryMatch = secondaryPositions.has(targetPosition) || secondaryPositions.has(mappedTarget);
  const outOfPosition = !primaryMatch && !secondaryMatch;

  let score = 0;
  score += startsAtPosition * 3;
  score += appearancesAtPosition;
  score += usage.starts;
  score += usage.appearances * 0.25;
  if (primaryMatch) score += 8;
  if (secondaryMatch) score += 4;
  if (targetPosition === "SP" && mappedPrimary === "RP") score -= 4;
  if (targetPosition === "RP" && mappedPrimary === "SP") score -= 1;
  if (outOfPosition) score -= 6;

  const reasons: string[] = [];
  if (primaryMatch) reasons.push("Primary position match");
  if (!primaryMatch && secondaryMatch) reasons.push("Secondary position fill");
  if (startsAtPosition > 0) reasons.push(`Recent starts at ${targetPosition}: ${startsAtPosition}`);
  if (appearancesAtPosition > 0) reasons.push(`Recent appearances at ${targetPosition}: ${appearancesAtPosition}`);
  if (outOfPosition) reasons.push("OOF: no primary/secondary alignment");

  return { score, outOfPosition, reasons };
}

async function buildDepthChart(teamId: number, season: number): Promise<DepthChartResponse> {
  const cacheKey = `${teamId}:${season}`;
  const cached = depthChartCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < DEPTH_CACHE_TTL_MS) {
    return cached.payload;
  }

  const rosterUrl = `${MLB_API}/teams/${teamId}/roster?rosterType=active&season=${season}`;
  const rosterData = await fetchJsonOrThrow<ActiveRosterResponse>(rosterUrl);

  const rawRoster = rosterData.roster ?? [];
  const filteredRoster = rawRoster
    .map((entry) => {
      const playerId = entry.person?.id;
      const playerName = entry.person?.fullName;
      if (!playerId || !playerName) return null;

      const status = entry.status?.description ?? entry.status?.code ?? "Active";
      const primary = entry.position?.abbreviation ?? "DH";
      return {
        playerId,
        playerName,
        primaryPosition: primary,
        status,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => isAvailableRosterStatus(entry.status));

  const playerIds = filteredRoster.map((p) => p.playerId);
  const usageByPlayer = new Map<number, DepthUsage>();
  for (const p of filteredRoster) {
    usageByPlayer.set(p.playerId, {
      appearances: 0,
      starts: 0,
      startsByPosition: new Map<string, number>(),
      appearancesByPosition: new Map<string, number>(),
    });
  }

  const today = safeDateOffset(0);
  const tenDaysAgo = safeDateOffset(10);
  const scheduleUrl =
    `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${tenDaysAgo}` +
    `&endDate=${today}&gameTypes=R`;
  const scheduleData = await fetchJsonOrThrow<ScheduleResponse>(scheduleUrl);
  const gamePks = (scheduleData.dates ?? [])
    .flatMap((d) => d.games ?? [])
    .map((g) => g.gamePk)
    .filter((pk): pk is number => typeof pk === "number")
    .slice(-7);

  await Promise.all(
    gamePks.map(async (gamePk) => {
      const boxUrl = `${MLB_API}/game/${gamePk}/boxscore`;
      let box: BoxScoreResponse;
      try {
        box = await fetchJsonOrThrow<BoxScoreResponse>(boxUrl);
      } catch {
        return;
      }

      const allPlayers = {
        ...(box.teams?.home?.players ?? {}),
        ...(box.teams?.away?.players ?? {}),
      };

      for (const boxPlayer of Object.values(allPlayers)) {
        const pid = boxPlayer.person?.id;
        if (!pid || !playerIds.includes(pid)) continue;

        const usage = usageByPlayer.get(pid);
        if (!usage) continue;

        usage.appearances += 1;

        const rawPosition = boxPlayer.position?.abbreviation ?? "DH";
        const mappedPosition = mapPositionSlot(rawPosition);
        incrementMapCount(usage.appearancesByPosition, rawPosition, 1);
        incrementMapCount(usage.appearancesByPosition, mappedPosition, 1);

        const battingStart = parseStarts(boxPlayer.stats?.batting?.gamesStarted);
        const pitchingStart = parseStarts(boxPlayer.stats?.pitching?.gamesStarted);
        const battingOrder = boxPlayer.stats?.batting?.battingOrder;
        const inferredLineupStart = typeof battingOrder === "string" && battingOrder.length > 0 ? 1 : 0;

        const started = Math.max(battingStart, pitchingStart, inferredLineupStart);
        if (started > 0) {
          usage.starts += 1;
          incrementMapCount(usage.startsByPosition, rawPosition, 1);
          incrementMapCount(usage.startsByPosition, mappedPosition, 1);
        }
      }
    }),
  );

  const secondaryByPlayer = new Map<number, Set<string>>();
  if (playerIds.length > 0) {
    const peopleUrl = `${MLB_API}/people?personIds=${playerIds.join(",")}` +
      `&hydrate=stats(group=[fielding,pitching],type=[season],season=${season})`;
    try {
      const people = await fetchJsonOrThrow<PeopleResponse>(peopleUrl);
      for (const player of people.people ?? []) {
        if (!player.id) continue;
        const positions = new Set<string>();
        for (const statGroup of player.stats ?? []) {
          for (const split of statGroup.splits ?? []) {
            const games = Number(split.stat?.games ?? 0);
            if (games < 3) continue;
            const pos = split.position?.abbreviation;
            if (!pos) continue;
            positions.add(pos.toUpperCase());
            positions.add(mapPositionSlot(pos));
          }
        }
        secondaryByPlayer.set(player.id, positions);
      }
    } catch {
      // Secondary positions are optional enrichment; depth still derives from primary + usage.
    }
  }

  const assignedByPosition = Object.fromEntries(
    DEPTH_POSITIONS.map((position) => [position, [] as DepthChartPlayer[]]),
  ) as Record<DepthChartPosition, DepthChartPlayer[]>;
  const manualReview: DepthChartResponse["manualReview"] = [];
  const usedPlayerIds = new Set<number>();

  for (const position of DEPTH_POSITIONS) {
    const rankedCandidates = filteredRoster
      .filter((entry) => !usedPlayerIds.has(entry.playerId))
      .map((entry) => {
        const usage = usageByPlayer.get(entry.playerId) ?? {
          appearances: 0,
          starts: 0,
          startsByPosition: new Map<string, number>(),
          appearancesByPosition: new Map<string, number>(),
        };
        const secondary = secondaryByPlayer.get(entry.playerId) ?? new Set<string>();
        const score = scoreCandidate(position, entry.primaryPosition, usage, secondary);
        return {
          ...entry,
          usage,
          ...score,
        };
      })
      .sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName));

    const topThree = rankedCandidates.slice(0, 3);
    assignedByPosition[position] = topThree.map((candidate, index) => {
      const rank = (index + 1) as 1 | 2 | 3;
      if (candidate.outOfPosition) {
        manualReview.push({
          playerId: candidate.playerId,
          playerName: candidate.playerName,
          requestedPosition: position,
          reason: "OOF (Out of Position) assignment",
        });
      }
      usedPlayerIds.add(candidate.playerId);
      return {
        rank,
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        primaryPosition: candidate.primaryPosition,
        status: candidate.status,
        usageStarts: candidate.usage.starts,
        usageAppearances: candidate.usage.appearances,
        outOfPosition: candidate.outOfPosition,
        needsManualReview: candidate.outOfPosition,
        reasons: candidate.reasons,
      };
    });
  }

  const month = new Date().getMonth() + 1;
  const rosterLimit: 26 | 28 = month === 9 ? 28 : 26;

  const response: DepthChartResponse = {
    teamId,
    generatedAt: new Date().toISOString(),
    season,
    rosterCount: filteredRoster.length,
    rosterLimit,
    positions: assignedByPosition,
    manualReview,
  };

  depthChartCache.set(cacheKey, { fetchedAt: Date.now(), payload: response });
  return response;
}

const getTeamDepthChart: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new AppError("Invalid teamId parameter", 400, "VALIDATION_ERROR", {
        teamId: req.params.teamId,
      });
    }

    const seasonParam = Number(req.query.season);
    const season = Number.isInteger(seasonParam) && seasonParam > 0
      ? seasonParam
      : new Date().getFullYear();

    const chart = await buildDepthChart(teamId, season);
    const rosterOverLimit = chart.rosterCount > chart.rosterLimit;

    res.json({
      ...chart,
      constraints: {
        rosterLimitRespected: !rosterOverLimit,
        note: rosterOverLimit
          ? `Active roster (${chart.rosterCount}) exceeds ${chart.rosterLimit}-man limit`
          : `Active roster (${chart.rosterCount}) is within ${chart.rosterLimit}-man limit`,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(
      new UpstreamError("Failed to build team depth chart", 502, "MLB_DEPTH_CHART_ERROR", {
        cause: err instanceof Error ? err.message : String(err),
      }),
    );
  }
};

// ─── Route ────────────────────────────────────────────────────────────────────

const getPlayers: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sortBy = (req.query.sortBy as string) || "value";
    const playerPool = (req.query.playerPool as string) || "Mixed";
    const threshold = Number(req.query.posEligibilityThreshold ?? 20);

    // Serve from cache if fresh
    const cached = serverPlayerCache.get(threshold);
    if (cached && Date.now() - cached.fetchedAt < SERVER_CACHE_TTL_MS) {
      const poolFiltered = filterByPlayerPool(cached.players, playerPool as "Mixed" | "AL" | "NL");
      const withAdp = applyAdpByValue(poolFiltered);
      const players = sortPlayers(withAdp, sortBy as "value" | "adp" | "name");
      res.json({ players, count: players.length });
      return;
    }

    const currentYear = new Date().getFullYear();
    const season = currentYear - 1; // last completed season
    const season2 = season - 1;
    const season3 = season - 2;

    // Fetch 3 seasons of stats + spring training in parallel
    // Note: MLB API is generally permissive, but these calls only happen on cache misses (every 30min)
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
      // Log rate limiting issues for monitoring
      if (failed.some(r => r.status === 429)) {
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

    // Build per-season stat lookup maps (playerId → stat record)
    const buildStatMap = (splits: MlbStatSplit[]) =>
      new Map(splits.map((s) => [s.player.id, s.stat]));
    const bat2Map = buildStatMap(bat2Splits);
    const bat3Map = buildStatMap(bat3Splits);
    const pit2Map = buildStatMap(pit2Splits);
    const pit3Map = buildStatMap(pit3Splits);
    const batSpringMap = buildStatMap(batSpringSplits);
    const pitSpringMap = buildStatMap(pitSpringSplits);

    // Build injury status map from 40-man roster status codes across all 30 teams.
    // D10/D15/D60 = IL placements (works year-round, including spring training).
    const MLB_TEAM_IDS = [
      108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 133,
      134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
    ];
    const IL_STATUS_MAP: Record<string, string> = {
      D10: "IL10",
      D15: "IL15",
      D60: "IL60",
      D7: "IL7",
    };
    const injuryStatusMap = new Map<number, string>();
    try {
      const rosterResults = await Promise.all(
        MLB_TEAM_IDS.map((id) =>
          fetch(
            `${MLB_API}/teams/${id}/roster?rosterType=40Man&season=${currentYear}`,
          ).then((r) => r.json() as Promise<{ roster?: RosterEntry[] }>),
        ),
      );
      for (const rj of rosterResults) {
        for (const entry of rj.roster ?? []) {
          const code = entry.status?.code;
          if (code && IL_STATUS_MAP[code]) {
            injuryStatusMap.set(entry.person.id, IL_STATUS_MAP[code]);
          }
        }
      }
    } catch {
      /* best-effort */
    }

    // Fetch player bio info (age, position) for batters
    const playerIds = [
      ...new Set([
        ...batSplits.map((s) => s.player.id),
        ...pitSplits.map((s) => s.player.id),
      ]),
    ].slice(0, 500);

    // Build a map of playerId -> bio from a batch people call
    const bioMap = new Map<number, MlbPlayer>();
    try {
      const bioRes = await fetch(
        MLB_API +
          "/people?personIds=" +
          playerIds.join(",") +
          "&hydrate=currentTeam",
      );
      const bioJson = (await bioRes.json()) as { people: MlbPlayer[] };
      for (const p of bioJson.people ?? []) bioMap.set(p.id, p);
    } catch {
      // bio fetch is best-effort
    }

    // Build multi-position eligibility map from fielding stats.
    // A player qualifies at a position if they appeared there in N+ games.
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
          isPitchingPosition(s.position?.abbreviation ?? "")
            ? "pitching"
            : "hitting",
        );
        const existing = posEligibilityMap.get(pid) ?? [];
        if (!existing.includes(pos)) existing.push(pos);
        posEligibilityMap.set(pid, existing);
      }
    } catch {
      // fielding fetch is best-effort
    }

    // Process batters
    const batters = batSplits
      .filter((s) => Number(s.stat.atBats ?? 0) >= 100)
      .map((s) => {
        const bio = bioMap.get(s.player.id);
        const value = calcBatterValue(s.stat);
        const stat = s.stat;
        const pid = s.player.id;
        const springStat = batSpringMap.get(pid);
        return {
          id: String(pid),
          mlbId: pid,
          name: s.player.fullName,
          team: teamAbbrev(s.team, bio?.currentTeam),
          position: normalizeFantasyPosition(
            s.position?.abbreviation ??
              bio?.primaryPosition?.abbreviation ??
              "OF",
            "hitting",
          ),
          positions: resolveEligiblePositions(
            posEligibilityMap.get(pid),
            s.position?.abbreviation ??
              bio?.primaryPosition?.abbreviation ??
              "OF",
            "hitting",
          ),
          age: calcAge(bio?.birthDate),
          adp: 0,
          value,
          tier: assignTier(value),
          headshot:
            "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/" +
            pid +
            "/headshot/67/current",
          stats: {
            batting: {
              avg: String(stat.avg ?? ".000"),
              hr: Number(stat.homeRuns ?? 0),
              rbi: Number(stat.rbi ?? 0),
              runs: Number(stat.runs ?? 0),
              sb: Number(stat.stolenBases ?? 0),
              obp: String(stat.obp ?? ".000"),
              slg: String(stat.slg ?? ".000"),
            },
          },
          projection: {
            batting: projectBatting(stat, bat2Map.get(pid), bat3Map.get(pid)),
          },
          outlook: "",
          injuryStatus: injuryStatusMap.get(pid),
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
      });

    // Process pitchers
    const pitchers = pitSplits
      .filter(
        (s) =>
          parseFloat(String(s.stat.inningsPitched ?? "0")) >= 20 ||
          Number(s.stat.saves ?? 0) >= 5,
      )
      .map((s) => {
        const bio = bioMap.get(s.player.id);
        const value = calcPitcherValue(s.stat);
        const stat = s.stat;
        const pid = s.player.id;
        const springStat = pitSpringMap.get(pid);
        return {
          id: String(pid),
          mlbId: pid,
          name: s.player.fullName,
          team: teamAbbrev(s.team, bio?.currentTeam),
          position: normalizeFantasyPosition(
            s.position?.abbreviation ??
              bio?.primaryPosition?.abbreviation ??
              "SP",
            "pitching",
          ),
          positions: resolveEligiblePositions(
            posEligibilityMap.get(pid),
            s.position?.abbreviation ??
              bio?.primaryPosition?.abbreviation ??
              "SP",
            "pitching",
          ),
          age: calcAge(bio?.birthDate),
          adp: 0,
          value,
          tier: assignTier(value),
          headshot:
            "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/" +
            pid +
            "/headshot/67/current",
          stats: {
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
          },
          projection: {
            pitching: projectPitching(stat, pit2Map.get(pid), pit3Map.get(pid)),
          },
          outlook: "",
          injuryStatus: injuryStatusMap.get(pid),
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
      });

    const deduped = mergeTwoWayPlayers([
      ...(batters as PlayerData[]),
      ...(pitchers as PlayerData[]),
    ]);
    const valueFiltered = deduped.filter((p) => p.value > 0);
    serverPlayerCache.set(threshold, { players: valueFiltered, fetchedAt: Date.now() });

    const poolFiltered = filterByPlayerPool(
      valueFiltered,
      playerPool as "Mixed" | "AL" | "NL",
    );
    const withAdp = applyAdpByValue(poolFiltered);
    const players = sortPlayers(
      withAdp,
      sortBy as "value" | "adp" | "name",
    );

    res.json({ players, count: players.length });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }

    next(new UpstreamError("Failed to fetch player data", 502, "PLAYER_DATA_ERROR", {
      cause: err instanceof Error ? err.message : String(err),
    }));
  }
};

// ─── POST /api/players/valuations (fixture-driven; Activity #9) ───────────────
// Auth: PLAYER_API_TEST_KEY via x-player-api-key or Authorization: Bearer

const postFixtureValuations: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = req.body as ValuationIncomingParsed;
    const context = valuationIncomingToEngineContext(parsed);
    const payload = finalizeEngineValuationPostPayload(context);
    const axiosRes = await amethyst.post("/valuation/calculate", payload);
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof AxiosError) {
      const status = err.response?.status ?? 502;
      const body = err.response?.data ?? { error: "Engine unreachable" };
      next(
        new UpstreamError(
          "Engine request failed",
          status,
          "ENGINE_UPSTREAM_ERROR",
          body,
        ),
      );
      return;
    }
    next(
      new UpstreamError("Engine unreachable", 502, "ENGINE_UNREACHABLE", {
        cause: err instanceof Error ? err.message : String(err),
      }),
    );
  }
};

router.post(
  "/valuations",
  playerApiTestKeyAuth,
  validateBody(valuationIncomingSchema),
  postFixtureValuations,
);

router.get("/depth-chart/:teamId", getTeamDepthChart);
router.get("/", validateQuery(playersQuerySchema), getPlayers);

export default router;
