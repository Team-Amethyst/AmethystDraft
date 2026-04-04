import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import {
  isPitchingPosition,
  normalizeFantasyPosition,
  resolveEligiblePositions,
} from "../lib/playerEligibility";
import { validateQuery } from "../validation/validate";
import { playersQuerySchema } from "../validation/schemas";
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
  status?: { code: string; description: string };
}

interface MlbStatSplit {
  player: { id: number; fullName: string };
  team?: { id: number; abbreviation?: string };
  position?: { abbreviation: string };
  stat: Record<string, string | number>;
}

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

router.get("/", validateQuery(playersQuerySchema), getPlayers);

export default router;
