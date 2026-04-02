export type StatRecord = Record<string, string | number>;

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

export function calcPitcherValue(stat: StatRecord): number {
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

export function projectBatting(
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

export function projectPitching(
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
  innings: number;
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
