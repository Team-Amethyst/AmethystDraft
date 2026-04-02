import { Router, Request, Response, RequestHandler } from "express";
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
import { AL_TEAMS, NL_TEAMS, teamAbbrev } from "../lib/mlbTeams";

const router: Router = Router();

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

// ─── Shared player shape ─────────────────────────────────────────────────────

interface PlayerData {
  id: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
  positions: string[];
  age: number;
  adp: number;
  value: number;
  tier: number;
  headshot: string;
  stats: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      obp: string;
      slg: string;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      innings: string;
      completeGames: number;
    };
  };
  projection: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      completeGames: number;
      innings: number;
    };
  };
  outlook: string;
  injuryStatus?: string;
  springStats?: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      ab: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      strikeouts: number;
      innings: string;
    };
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

const getPlayers: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sortBy = (req.query.sortBy as string) || "value";
    const playerPool = (req.query.playerPool as string) || "Mixed";
    const currentYear = new Date().getFullYear();
    const season = currentYear - 1; // last completed season
    const season2 = season - 1;
    const season3 = season - 2;

    // Fetch 3 seasons of stats + spring training in parallel
    const [
      batRes,
      pitRes,
      bat2Res,
      pit2Res,
      bat3Res,
      pit3Res,
      batSpringRes,
      pitSpringRes,
    ] = await Promise.all([
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
    const FIELDING_QUALIFY_GAMES = Number(
      req.query.posEligibilityThreshold ?? 20,
    );
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

    // Deduplicate: if a player appears in both arrays (TWP like Ohtani), merge
    // their positions and combine stats rather than discarding one record.
    const allMap = new Map<string, PlayerData>();
    for (const p of [
      ...(batters as PlayerData[]),
      ...(pitchers as PlayerData[]),
    ]) {
      const existing = allMap.get(p.id);
      if (!existing) {
        allMap.set(p.id, p);
      } else {
        // Merge positions from both records, keep higher value
        const mergedPositions = [
          ...new Set([...existing.positions, ...p.positions]),
        ];
        // For TWPs, use the pitching position as primary (rarer, more fantasy-informative)
        const pitchingPos = mergedPositions.find((pos) =>
          ["SP", "RP", "P"].includes(pos),
        );
        const winnerByValue = p.value > existing.value ? p : existing;
        const merged: PlayerData = {
          ...winnerByValue,
          position: pitchingPos ?? winnerByValue.position,
          positions: mergedPositions,
          stats: {
            ...existing.stats,
            ...p.stats,
          },
        };
        allMap.set(p.id, merged);
      }
    }

    let players = Array.from(allMap.values()).filter((p) => p.value > 0);

    // Filter by player pool (AL-only / NL-only leagues)
    if (playerPool === "AL") {
      players = players.filter((p) => AL_TEAMS.has(p.team));
    } else if (playerPool === "NL") {
      players = players.filter((p) => NL_TEAMS.has(p.team));
    }

    // Assign ADP rank by value as proxy (real ADP would need a paid source)
    players.sort((a, b) => b.value - a.value);
    players = players.map((p, i) => ({ ...p, adp: i + 1 }));

    // Apply requested sort
    if (sortBy === "name") players.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "adp") players.sort((a, b) => a.adp - b.adp);
    // default is value (already sorted)

    res.json({ players, count: players.length });
  } catch (err) {
    console.error("Players route error:", err);
    res.status(500).json({ message: "Failed to fetch player data" });
  }
};

router.get("/", validateQuery(playersQuerySchema), getPlayers);

export default router;
