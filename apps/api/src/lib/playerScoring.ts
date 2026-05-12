export type StatRecord = Record<string, string | number>;

// Scoring coefficients for auction value calculation
// These represent z-score replacement values for rostered players in a 12-team league
const SCORING_COEFFICIENTS = {
  // Batting coefficients (per standard deviation above/below average)
  HR_PER_Z: 2.8,
  RBI_PER_Z: 0.9,
  RUNS_PER_Z: 0.9,
  SB_PER_Z: 3.2,
  AVG_PER_Z: 3.5, // multiplied by at-bats

  // League averages for rostered players (replacement level)
  AVG_HR: 18,
  AVG_RBI: 72,
  AVG_RUNS: 72,
  AVG_SB: 8,
  AVG_AVG: 0.258,

  // Pitching coefficients
  ERA_IMPROVEMENT_PER_IP: 0.5, // points per run below average per inning
  WHIP_IMPROVEMENT_PER_IP: 1.2,
  K_ABOVE_AVG: 0.18,
  W_ABOVE_AVG: 2.5,
  SV_VALUE: 2.8,

  // League averages for pitchers
  AVG_ERA: 4.2,
  AVG_WHIP: 1.28,
  AVG_K: 150,
  AVG_W: 9,

  // Minimum requirements
  MIN_AB: 100,
  MIN_IP: 20,
  MIN_SV_FOR_REPLACEMENT: 5,

  // Final scaling
  VALUE_SCALE: 0.28,
  VALUE_OFFSET: 15,
  PITCHER_VALUE_SCALE: 0.22,
  PITCHER_VALUE_OFFSET: 12,
} as const;

// Calculate age from birthdate string
export function calcAge(birthDate?: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Assign tier based on auction value
export function assignTier(value: number): number {
  if (value >= 40) return 1;
  if (value >= 25) return 2;
  if (value >= 15) return 3;
  if (value >= 5) return 4;
  return 5;
}

// Standard SGP-based auction value formula (12-team, 60 budget)
// Simplified: value proportional to z-score sum across categories
export function calcBatterValue(stat: StatRecord): number {
  const hr = Number(stat.homeRuns ?? 0);
  const rbi = Number(stat.rbi ?? 0);
  const runs = Number(stat.runs ?? 0);
  const sb = Number(stat.stolenBases ?? 0);
  const avg = parseFloat(String(stat.avg ?? "0"));
  const ab = Number(stat.atBats ?? 0);
  if (ab < SCORING_COEFFICIENTS.MIN_AB) return 0;

  // Rough z-score replacement values (league averages for rostered players)
  const score =
    (hr - SCORING_COEFFICIENTS.AVG_HR) * SCORING_COEFFICIENTS.HR_PER_Z +
    (rbi - SCORING_COEFFICIENTS.AVG_RBI) * SCORING_COEFFICIENTS.RBI_PER_Z +
    (runs - SCORING_COEFFICIENTS.AVG_RUNS) * SCORING_COEFFICIENTS.RUNS_PER_Z +
    (sb - SCORING_COEFFICIENTS.AVG_SB) * SCORING_COEFFICIENTS.SB_PER_Z +
    (avg - SCORING_COEFFICIENTS.AVG_AVG) * ab * SCORING_COEFFICIENTS.AVG_PER_Z;

  return Math.round(Math.max(1, score * SCORING_COEFFICIENTS.VALUE_SCALE + SCORING_COEFFICIENTS.VALUE_OFFSET));
}

export function calcPitcherValue(stat: StatRecord): number {
  const era = parseFloat(String(stat.era ?? "9"));
  const whip = parseFloat(String(stat.whip ?? "2"));
  const k = Number(stat.strikeOuts ?? 0);
  const w = Number(stat.wins ?? 0);
  const sv = Number(stat.saves ?? 0);
  const ip = parseFloat(String(stat.inningsPitched ?? "0"));
  if (ip < SCORING_COEFFICIENTS.MIN_IP && sv < SCORING_COEFFICIENTS.MIN_SV_FOR_REPLACEMENT) return 0;

  const score =
    (SCORING_COEFFICIENTS.AVG_ERA - era) * ip * SCORING_COEFFICIENTS.ERA_IMPROVEMENT_PER_IP +
    (SCORING_COEFFICIENTS.AVG_WHIP - whip) * ip * SCORING_COEFFICIENTS.WHIP_IMPROVEMENT_PER_IP +
    (k - SCORING_COEFFICIENTS.AVG_K) * SCORING_COEFFICIENTS.K_ABOVE_AVG +
    (w - SCORING_COEFFICIENTS.AVG_W) * SCORING_COEFFICIENTS.W_ABOVE_AVG +
    sv * SCORING_COEFFICIENTS.SV_VALUE;

  return Math.round(Math.max(1, score * SCORING_COEFFICIENTS.PITCHER_VALUE_SCALE + SCORING_COEFFICIENTS.PITCHER_VALUE_OFFSET));
}

/** Recent season weighted more heavily (used for `projection` on catalog players). */
export const SEASON_BLEND_WEIGHTS_RECENT: readonly [number, number, number] = [
  5, 3, 2,
];

/** Equal weight across three seasons (used for `stats3yr` display line). */
export const SEASON_BLEND_WEIGHTS_EQUAL: readonly [number, number, number] = [
  1, 1, 1,
];

export type BlendedBattingLine = {
  avg: string;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
};

export function blendBattingSeasons(
  yr1: StatRecord,
  yr2: StatRecord | null | undefined,
  yr3: StatRecord | null | undefined,
  weights: readonly [number, number, number],
): BlendedBattingLine {
  const years = [yr1, yr2, yr3] as const;
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
    const w = weights[i] ?? 1;
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

/** Mean OBP/SLG across seasons that qualify for the batting blend (AB ≥ 50). */
function meanBattingRates(
  yr1: StatRecord,
  yr2: StatRecord | null | undefined,
  yr3: StatRecord | null | undefined,
): { obp: string; slg: string } | undefined {
  const years = [yr1, yr2, yr3];
  const obps: number[] = [];
  const slgs: number[] = [];
  for (const s of years) {
    if (!s || Number(s.atBats ?? 0) < 50) continue;
    const o = parseFloat(String(s.obp ?? "0"));
    const g = parseFloat(String(s.slg ?? "0"));
    if (Number.isFinite(o)) obps.push(o);
    if (Number.isFinite(g)) slgs.push(g);
  }
  if (obps.length === 0 && slgs.length === 0) return undefined;
  return {
    obp:
      obps.length > 0
        ? (obps.reduce((a, b) => a + b, 0) / obps.length).toFixed(3)
        : ".000",
    slg:
      slgs.length > 0
        ? (slgs.reduce((a, b) => a + b, 0) / slgs.length).toFixed(3)
        : ".000",
  };
}

/** 5/3/2-weighted multi-year batting line (catalog `projection.batting`). */
export function projectBatting(
  yr1: StatRecord,
  yr2?: StatRecord | null,
  yr3?: StatRecord | null,
): BlendedBattingLine {
  return blendBattingSeasons(yr1, yr2, yr3, SEASON_BLEND_WEIGHTS_RECENT);
}

/** Equal-weight three-year batting line plus mean OBP/SLG for display (`stats3yr`). */
export function equalWeightThreeYearBatting(
  yr1: StatRecord,
  yr2?: StatRecord | null,
  yr3?: StatRecord | null,
): BlendedBattingLine & { obp: string; slg: string } {
  const base = blendBattingSeasons(yr1, yr2, yr3, SEASON_BLEND_WEIGHTS_EQUAL);
  const rates = meanBattingRates(yr1, yr2, yr3);
  return {
    ...base,
    obp: rates?.obp ?? ".000",
    slg: rates?.slg ?? ".000",
  };
}

export type BlendedPitchingLine = {
  era: string;
  whip: string;
  wins: number;
  saves: number;
  holds: number;
  strikeouts: number;
  completeGames: number;
  innings: number;
};

export function blendPitchingSeasons(
  yr1: StatRecord,
  yr2: StatRecord | null | undefined,
  yr3: StatRecord | null | undefined,
  weights: readonly [number, number, number],
): BlendedPitchingLine {
  const years = [yr1, yr2, yr3] as const;
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
    const w = weights[i] ?? 1;
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
      innings: Math.round(parseFloat(String(yr1.inningsPitched ?? "0"))),
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
    innings: Math.round(wIP / wTotal),
  };
}

/** 5/3/2-weighted multi-year pitching line (catalog `projection.pitching`). */
export function projectPitching(
  yr1: StatRecord,
  yr2?: StatRecord | null,
  yr3?: StatRecord | null,
): BlendedPitchingLine {
  return blendPitchingSeasons(yr1, yr2, yr3, SEASON_BLEND_WEIGHTS_RECENT);
}

/** Equal-weight three-year pitching line for display (`stats3yr`). */
export function equalWeightThreeYearPitching(
  yr1: StatRecord,
  yr2?: StatRecord | null,
  yr3?: StatRecord | null,
): BlendedPitchingLine {
  return blendPitchingSeasons(yr1, yr2, yr3, SEASON_BLEND_WEIGHTS_EQUAL);
}
