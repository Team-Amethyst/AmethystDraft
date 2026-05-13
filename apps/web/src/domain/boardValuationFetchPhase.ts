/**
 * Classifies Engine board valuation fetch UX before `await getValuation` resolves.
 * Used by Research, Command Center, and My Draft for loading vs stale-refresh states.
 */
import type { Player } from "../types/player";

export type BoardValuationFetchPhaseClass =
  | "idle"
  | "loading"
  | "refreshing"
  /** Client cache already has this key — `getValuation` resolves without network. */
  | "ready_sync";

export function classifyBoardValuationFetchPhase(input: {
  canStartFetch: boolean;
  /** True when {@link ../api/valuationCache.peekBoardValuationCache} returns data for `activeCacheKey`. */
  peekHit: boolean;
  /** Cache key from {@link ../api/valuationCache.buildValuationBoardCacheKey} for the request about to run. */
  activeCacheKey: string;
  /** Key that last successfully populated UI state (set after each successful apply). */
  lastSuccessCacheKey: string | null;
  /** Whether the UI still shows a prior board snapshot (merged map or `engineMarket`). */
  displayedBoardPresent: boolean;
}): BoardValuationFetchPhaseClass {
  if (!input.canStartFetch) return "idle";
  if (input.peekHit) return "ready_sync";
  if (
    input.displayedBoardPresent &&
    input.lastSuccessCacheKey !== null &&
    input.lastSuccessCacheKey !== input.activeCacheKey
  ) {
    return "refreshing";
  }
  return "loading";
}

/** UI phase after combining classifier with in-flight completion (caller sets `ready` / `error`). */
export type BoardValuationUiPhase =
  | "idle"
  | "loading"
  | "refreshing"
  | "ready"
  | "error";

/** While Research waits for the first board snapshot, hide Engine dollar/rank cells for valuation rows. */
export function shouldMaskResearchEngineColumns(
  phase: BoardValuationUiPhase,
  player: Pick<Player, "valuation_eligible" | "catalog_kind">,
): boolean {
  if (phase !== "loading") return false;
  if (player.valuation_eligible === false) return false;
  if (player.catalog_kind === "market_only") return false;
  return true;
}

/** Players for whom the Command Center bid ladder expects Engine board-backed dollars. */
export function isEngineValuationLadderPlayer(
  player: Pick<Player, "valuation_eligible" | "catalog_kind">,
): boolean {
  if (player.valuation_eligible === false) return false;
  if (player.catalog_kind === "market_only") return false;
  return true;
}

/**
 * Command Center bid ladder: show a loading icon instead of an em dash for a missing cell
 * while the board snapshot is not settled (`ready` / `error`). Covers idle (e.g. roster
 * warming), first fetch (`loading`), and background refresh (`refreshing`).
 */
export function shouldShowBidLadderCellSpinner(
  phase: BoardValuationUiPhase,
  player: Pick<Player, "valuation_eligible" | "catalog_kind">,
  cellHasValue: boolean,
): boolean {
  if (cellHasValue) return false;
  if (phase === "ready" || phase === "error") return false;
  return isEngineValuationLadderPlayer(player);
}
