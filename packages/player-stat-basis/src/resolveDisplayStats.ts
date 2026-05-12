import type { DisplayBatting, DisplayPitching, PlayerStatSnapshot, StatBasis } from "./types";
import { toDisplayBatting, toDisplayPitching } from "./toDisplayLines";

/**
 * Resolves the counting/rate lines shown in research tables for the active basis.
 * - `projections`: weighted 5/3/2 blend (`projection`) with fallback to last season `stats`.
 * - `last-year`: last completed MLB season (`stats`) with fallback to `projection` when sparse.
 * - `3-year-avg`: equal-weight 3-season blend (`stats3yr`), then `stats`, then `projection`.
 */
export function resolveDisplayStats(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): { bat?: DisplayBatting; pit?: DisplayPitching } {
  if (statBasis === "projections") {
    const bat = toDisplayBatting(
      player.projection?.batting ?? player.stats?.batting,
    );
    const pit = toDisplayPitching(
      player.projection?.pitching ?? player.stats?.pitching,
    );
    return { bat, pit };
  }

  if (statBasis === "last-year") {
    const bat = toDisplayBatting(
      player.stats?.batting ?? player.projection?.batting,
    );
    const pit = toDisplayPitching(
      player.stats?.pitching ?? player.projection?.pitching,
    );
    return { bat, pit };
  }

  const bat = toDisplayBatting(
    player.stats3yr?.batting ??
      player.stats?.batting ??
      player.projection?.batting,
  );
  const pit = toDisplayPitching(
    player.stats3yr?.pitching ??
      player.stats?.pitching ??
      player.projection?.pitching,
  );
  return { bat, pit };
}
