import type { ILeague } from "../models/League";

/** Engine request flag: calibrated Stage 3b demo opening board (not generic empty-league math). */
export const STAGE3B_DEMO_OPENING_CALIBRATION = "stage3b_demo_v1" as const;

export type Stage3bDemoOpeningCalibration =
  typeof STAGE3B_DEMO_OPENING_CALIBRATION;

/**
 * Leagues that may receive valuation-only Stage 3b keeper/budget augmentation.
 * Intentionally narrow: the shipped "Original" demo preset, not every empty league.
 */
export function leagueQualifiesForStage3bDemoOpeningCalibration(
  league: Pick<ILeague, "name">,
): boolean {
  const name = String(league.name ?? "").trim();
  return /^original$/i.test(name);
}
