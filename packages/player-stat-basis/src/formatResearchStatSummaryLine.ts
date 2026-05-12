import type { PlayerStatSnapshot, StatBasis } from "./types";
import { resolveDisplayStats } from "./resolveDisplayStats";

/** One-line summary for mobile list rows — matches web table stat resolution. */
export function formatResearchStatSummaryLine(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): string | null {
  const { bat, pit } = resolveDisplayStats(player, statBasis);
  const prefix =
    statBasis === "projections" ? "Proj" : statBasis === "last-year" ? "1Y" : "3Y";

  if (bat) {
    return `${prefix} AVG ${bat.avg} • HR ${bat.hr} • RBI ${bat.rbi} • SB ${bat.sb}`;
  }
  if (pit) {
    return `${prefix} ERA ${pit.era} • WHIP ${pit.whip} • K ${pit.strikeouts} • SV ${pit.saves}`;
  }
  return null;
}
