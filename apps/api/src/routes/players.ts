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

interface MlbStatSplit {
  player: { id: number; fullName: string };
  team?: { id: number; abbreviation?: string };
  position?: { abbreviation: string };
  stat: Record<string, string | number>;
}

// MLB team ID → abbreviation (stable across seasons)
const MLB_TEAM_ABBREV: Record<number, string> = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
  113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
  118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
  134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
  139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
  144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
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

// ─── Shared player shape ─────────────────────────────────────────────────────

interface PlayerData {
  id: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
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
      strikeouts: number;
      innings: string;
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
      strikeouts: number;
    };
  };
  outlook: string;
}

// ─── Route ────────────────────────────────────────────────────────────────────

const getPlayers: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sortBy = (req.query.sortBy as string) || "value";
    const season = new Date().getFullYear() - 1; // use last completed season

    // Fetch batting and pitching stats in parallel
    const [batRes, pitRes] = await Promise.all([
      fetch(
        MLB_API +
          "/stats?stats=season&group=hitting&season=" +
          season +
          "&playerPool=ALL&limit=400&sportId=1",
      ),
      fetch(
        MLB_API +
          "/stats?stats=season&group=pitching&season=" +
          season +
          "&playerPool=ALL&limit=300&sportId=1",
      ),
    ]);

    const batJson = (await batRes.json()) as {
      stats: { splits: MlbStatSplit[] }[];
    };
    const pitJson = (await pitRes.json()) as {
      stats: { splits: MlbStatSplit[] }[];
    };

    const batSplits: MlbStatSplit[] = batJson.stats?.[0]?.splits ?? [];
    const pitSplits: MlbStatSplit[] = pitJson.stats?.[0]?.splits ?? [];

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

    // Process batters
    const batters = batSplits
      .filter((s) => Number(s.stat.atBats ?? 0) >= 100)
      .map((s) => {
        const bio = bioMap.get(s.player.id);
        const value = calcBatterValue(s.stat);
        const stat = s.stat;
        return {
          id: String(s.player.id),
          mlbId: s.player.id,
          name: s.player.fullName,
          team: teamAbbrev(s.team, bio?.currentTeam),
          position:
            s.position?.abbreviation ??
            bio?.primaryPosition?.abbreviation ??
            "OF",
          age: calcAge(bio?.birthDate),
          adp: 0,
          value,
          tier: assignTier(value),
          headshot:
            "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/" +
            s.player.id +
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
            batting: {
              avg: String(stat.avg ?? ".000"),
              hr: Number(stat.homeRuns ?? 0),
              rbi: Number(stat.rbi ?? 0),
              runs: Number(stat.runs ?? 0),
              sb: Number(stat.stolenBases ?? 0),
            },
          },
          outlook: "",
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
        return {
          id: String(s.player.id),
          mlbId: s.player.id,
          name: s.player.fullName,
          team: teamAbbrev(s.team, bio?.currentTeam),
          position:
            s.position?.abbreviation ??
            bio?.primaryPosition?.abbreviation ??
            "SP",
          age: calcAge(bio?.birthDate),
          adp: 0,
          value,
          tier: assignTier(value),
          headshot:
            "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/" +
            s.player.id +
            "/headshot/67/current",
          stats: {
            pitching: {
              era: String(stat.era ?? "0.00"),
              whip: String(stat.whip ?? "0.00"),
              wins: Number(stat.wins ?? 0),
              saves: Number(stat.saves ?? 0),
              strikeouts: Number(stat.strikeOuts ?? 0),
              innings: String(stat.inningsPitched ?? "0"),
            },
          },
          projection: {
            pitching: {
              era: String(stat.era ?? "0.00"),
              whip: String(stat.whip ?? "0.00"),
              wins: Number(stat.wins ?? 0),
              saves: Number(stat.saves ?? 0),
              strikeouts: Number(stat.strikeOuts ?? 0),
            },
          },
          outlook: "",
        };
      });

    // Deduplicate (some players appear in both — keep higher value)
    const allMap = new Map<string, PlayerData>();
    for (const p of [
      ...(batters as PlayerData[]),
      ...(pitchers as PlayerData[]),
    ]) {
      const existing = allMap.get(p.id);
      if (!existing || p.value > existing.value) allMap.set(p.id, p);
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
