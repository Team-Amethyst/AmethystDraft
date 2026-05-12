import type { PlayerStatSnapshot } from "./types";

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

export function playerIsPitcher(p: PlayerStatSnapshot): boolean {
  const hasPit = !!(p.projection?.pitching ?? p.stats?.pitching);
  const hasBat = !!(p.projection?.batting ?? p.stats?.batting);
  if (hasPit && !hasBat) return true;
  if (hasBat && !hasPit) return false;
  return PITCHER_POSITIONS.has(p.position.toUpperCase());
}
