import type { BattingCountLine, DisplayBatting, DisplayPitching, PitchingCountLine } from "./types";

export function toDisplayBatting(
  batting?: BattingCountLine,
): DisplayBatting | undefined {
  if (!batting) return undefined;
  return {
    avg: String(batting.avg ?? "0.000"),
    hr: Number(batting.hr ?? 0),
    rbi: Number(batting.rbi ?? 0),
    runs: Number(batting.runs ?? 0),
    sb: Number(batting.sb ?? 0),
  };
}

export function toDisplayPitching(
  pitching?: PitchingCountLine,
): DisplayPitching | undefined {
  if (!pitching) return undefined;
  return {
    era: String(pitching.era ?? "0.000"),
    whip: String(pitching.whip ?? "0.000"),
    wins: Number(pitching.wins ?? 0),
    saves: Number(pitching.saves ?? 0),
    holds: Number(pitching.holds ?? 0),
    strikeouts: Number(pitching.strikeouts ?? 0),
    completeGames: Number(pitching.completeGames ?? 0),
  };
}
