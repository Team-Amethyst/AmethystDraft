import { Router, Request, Response, RequestHandler } from "express";

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

// MLB team ID → abbreviation (stable across seasons)
const MLB_TEAM_ABBREV: Record<number, string> = {
  108: "LAA",
  109: "ARI",
  110: "BAL",
  111: "BOS",
  112: "CHC",
  113: "CIN",
  114: "CLE",
  115: "COL",
  116: "DET",
  117: "HOU",
  118: "KC",
  119: "LAD",
  120: "WSH",
  121: "NYM",
  133: "OAK",
  134: "PIT",
  135: "SD",
  136: "SEA",
  137: "SF",
  138: "STL",
  139: "TB",
  140: "TEX",
  141: "TOR",
  142: "MIN",
  143: "PHI",
  144: "ATL",
  145: "CWS",
  146: "MIA",
  147: "NYY",
  158: "MIL",
};

function teamAbbrev(
  split?: { id: number; abbreviation?: string },
  bio?: { id: number; abbreviation?: string },
): string {
  return (
    split?.abbreviation ??
    MLB_TEAM_ABBREV[split?.id ?? 0] ??
    bio?.abbreviation ??
    MLB_TEAM_ABBREV[bio?.id ?? 0] ??
    "--"
  );
}

/**
 * Normalize raw MLB API position abbreviations to canonical fantasy positions.
 *
 * MLB API can return outfield variants (LF/CF/RF), generic pitcher (P),
 * two-way player (TWP), generic infielder (IF), and utility (UTL) codes
 * that don't map directly to typical fantasy roster slots.
 *
 * @param pos   Raw abbreviation from `s.position` or `bio.primaryPosition`
 * @param group "hitting" | "pitching" — disambiguates TWP and generic P
 */
function normalizePosition(pos: string, group: "hitting" | "pitching"): string {
  switch (pos.toUpperCase()) {
    // Outfield variants → OF
    case "LF":
    case "CF":
    case "RF":
      return "OF";
    // Two-way player: use pitching slot in pitching context, DH when batting
    case "TWP":
      return group === "pitching" ? "SP" : "DH";
    // Generic infielder — not a real fantasy slot, treat as utility hitter
    case "IF":
      return "UTIL";
    // Utility — map to DH as closest fantasy equivalent
    case "UTL":
      return "DH";
    default:
      return pos;
  }
}

// Calculate age from birthdate string
function calcAge(birthDate?: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Assign tier based on auction value
function assignTier(value: number): number {
  if (value >= 40) return 1;
  if (value >= 25) return 2;
  if (value >= 15) return 3;
  if (value >= 5) return 4;
  return 5;
}

// Standard SGP-based auction value formula (12-team, 60 budget)
// Simplified: value proportional to z-score sum across categories
function calcBatterValue(stat: Record<string, string | number>): number {
  const hr = Number(stat.homeRuns ?? 0);
  const rbi = Number(stat.rbi ?? 0);
  const runs = Number(stat.runs ?? 0);
  const sb = Number(stat.stolenBases ?? 0);
  const avg = parseFloat(String(stat.avg ?? "0"));
  const ab = Number(stat.atBats ?? 0);
  if (ab < 100) return 0;
  // Rough z-score replacement values (league averages for rostered players)
  const score =
    (hr - 18) * 2.8 +
    (rbi - 72) * 0.9 +
    (runs - 72) * 0.9 +
    (sb - 8) * 3.2 +
    (avg - 0.258) * ab * 3.5;
  return Math.round(Math.max(1, score * 0.28 + 15));
}

function calcPitcherValue(stat: Record<string, string | number>): number {
  const era = parseFloat(String(stat.era ?? "9"));
  const whip = parseFloat(String(stat.whip ?? "2"));
  const k = Number(stat.strikeOuts ?? 0);
  const w = Number(stat.wins ?? 0);
  const sv = Number(stat.saves ?? 0);
  const ip = parseFloat(String(stat.inningsPitched ?? "0"));
  if (ip < 20 && sv < 5) return 0;
  const score =
    (4.2 - era) * ip * 0.5 +
    (1.28 - whip) * ip * 1.2 +
    (k - 150) * 0.18 +
    (w - 9) * 2.5 +
    sv * 2.8;
  return Math.round(Math.max(1, score * 0.22 + 12));
}

// ─── Multi-year weighted projection helpers ─────────────────────────────────

type StatRecord = Record<string, string | number>;

function projectBatting(
  yr1: StatRecord,
  yr2?: StatRecord | null,
  yr3?: StatRecord | null,
): { avg: string; hr: number; rbi: number; runs: number; sb: number } {
  const years = [yr1, yr2, yr3];
  const W = [5, 3, 2];
  let wTotal = 0,
    wH = 0,
    wAB = 0,
    wHR = 0,
    wRBI = 0,
    wRuns = 0,
    wSB = 0;
  for (let i = 0; i < years.length; i++) {
    const s = years[i];
    if (!s) continue;
    const ab = Number(s.atBats ?? 0);
    if (ab < 50) continue;
    const w = W[i] ?? 1;
    wTotal += w;
    wAB += ab * w;
    wH += Number(s.hits ?? 0) * w;
    wHR += Number(s.homeRuns ?? 0) * w;
    wRBI += Number(s.rbi ?? 0) * w;
    wRuns += Number(s.runs ?? 0) * w;
    wSB += Number(s.stolenBases ?? 0) * w;
  }
  if (wTotal === 0)
    return {
      avg: String(yr1.avg ?? ".000"),
      hr: Number(yr1.homeRuns ?? 0),
      rbi: Number(yr1.rbi ?? 0),
      runs: Number(yr1.runs ?? 0),
      sb: Number(yr1.stolenBases ?? 0),
    };
  const avg = wAB > 0 ? wH / wAB : 0;
  return {
    avg: avg.toFixed(3),
    hr: Math.round(wHR / wTotal),
    rbi: Math.round(wRBI / wTotal),
    runs: Math.round(wRuns / wTotal),
    sb: Math.round(wSB / wTotal),
  };
}

function projectPitching(
  yr1: StatRecord,
  yr2?: StatRecord | null,
  yr3?: StatRecord | null,
): {
  era: string;
  whip: string;
  wins: number;
  saves: number;
  holds: number;
  strikeouts: number;
  completeGames: number;
} {
  const years = [yr1, yr2, yr3];
  const W = [5, 3, 2];
  let wTotal = 0,
    wIP = 0,
    wER = 0,
    wBR = 0,
    wK = 0,
    wWins = 0,
    wSV = 0,
    wHLD = 0,
    wCG = 0;
  for (let i = 0; i < years.length; i++) {
    const s = years[i];
    if (!s) continue;
    const ip = parseFloat(String(s.inningsPitched ?? "0"));
    const sv = Number(s.saves ?? 0);
    if (ip < 15 && sv < 3) continue;
    const w = W[i] ?? 1;
    wTotal += w;
    wIP += ip * w;
    wER += Number(s.earnedRuns ?? 0) * w;
    wBR += (Number(s.hits ?? 0) + Number(s.baseOnBalls ?? 0)) * w;
    wK += Number(s.strikeOuts ?? 0) * w;
    wWins += Number(s.wins ?? 0) * w;
    wSV += Number(s.saves ?? 0) * w;
    wHLD += Number(s.holds ?? 0) * w;
    wCG += Number(s.completeGames ?? 0) * w;
  }
  if (wTotal === 0)
    return {
      era: String(yr1.era ?? "0.00"),
      whip: String(yr1.whip ?? "0.00"),
      wins: Number(yr1.wins ?? 0),
      saves: Number(yr1.saves ?? 0),
      holds: Number(yr1.holds ?? 0),
      strikeouts: Number(yr1.strikeOuts ?? 0),
      completeGames: Number(yr1.completeGames ?? 0),
    };
  const era = wIP > 0 ? (wER / wIP) * 9 : 0;
  const whip = wIP > 0 ? wBR / wIP : 0;
  return {
    era: era.toFixed(2),
    whip: whip.toFixed(2),
    wins: Math.round(wWins / wTotal),
    saves: Math.round(wSV / wTotal),
    holds: Math.round(wHLD / wTotal),
    strikeouts: Math.round(wK / wTotal),
    completeGames: Math.round(wCG / wTotal),
  };
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
        const pos = normalizePosition(
          s.position?.abbreviation ?? "OF",
          ["P", "SP", "RP"].includes(s.position?.abbreviation ?? "")
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
          position: normalizePosition(
            s.position?.abbreviation ??
              bio?.primaryPosition?.abbreviation ??
              "OF",
            "hitting",
          ),
          positions: (() => {
            const fromFielding = posEligibilityMap.get(pid);
            if (fromFielding && fromFielding.length > 0) {
              // Keep only non-pitching positions on a batter record
              return fromFielding.filter((p) => !["SP", "RP", "P"].includes(p));
            }
            return [
              normalizePosition(
                s.position?.abbreviation ??
                  bio?.primaryPosition?.abbreviation ??
                  "OF",
                "hitting",
              ),
            ];
          })(),
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
          position: normalizePosition(
            s.position?.abbreviation ??
              bio?.primaryPosition?.abbreviation ??
              "SP",
            "pitching",
          ),
          positions: (() => {
            const fromFielding = posEligibilityMap.get(pid);
            if (fromFielding && fromFielding.length > 0) {
              // Keep only pitching positions on a pitcher record
              return fromFielding.filter((p) => ["SP", "RP", "P"].includes(p));
            }
            return [
              normalizePosition(
                s.position?.abbreviation ??
                  bio?.primaryPosition?.abbreviation ??
                  "SP",
                "pitching",
              ),
            ];
          })(),
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

router.get("/", getPlayers);

export default router;
