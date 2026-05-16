import { useMemo } from "react";
import type { WatchlistPlayer } from "../api/watchlist";
import { hasPitcherEligibility } from "../utils/eligibility";
import {
  mergePlayerWithValuation,
  resolveValuationNumber,
  type ValuationShape,
  type ValuationSortField,
} from "../utils/valuation";
import { playerFromWatchlistEntry } from "../domain/watchlistToPlayer";

export type MyDraftWatchlistRow = WatchlistPlayer & {
  baseline_value?: number;
  auction_value?: number;
  recommended_bid?: number;
  team_value?: number;
};

export function useMyDraftWatchlistDerived(
  watchlist: WatchlistPlayer[],
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
  viewFilter: "all" | "hitters" | "pitchers",
  targetOverrides: Record<string, number>,
  valuationSortField: ValuationSortField,
): {
  effectiveWatchlist: MyDraftWatchlistRow[];
  watchlistTargetTotal: number;
  filteredWatchlist: MyDraftWatchlistRow[];
} {
  const effectiveWatchlist = useMemo((): MyDraftWatchlistRow[] => {
    return watchlist.map((p) => {
      const merged = mergePlayerWithValuation(
        playerFromWatchlistEntry(p),
        valuationsByPlayerId.get(p.id),
      );
      return {
        ...p,
        baseline_value: merged.baseline_value,
        auction_value: merged.auction_value,
        recommended_bid: merged.recommended_bid,
        team_value: merged.team_value,
      };
    });
  }, [watchlist, valuationsByPlayerId]);

  const { watchlistTargetTotal, filteredWatchlist } = useMemo(() => {
    let targetTotal = 0;
    for (const player of effectiveWatchlist) {
      targetTotal +=
        targetOverrides[player.id] ??
        Math.round(resolveValuationNumber(player, "team_value"));
    }

    let filtered = [...effectiveWatchlist];
    if (viewFilter === "hitters") {
      filtered = filtered.filter(
        (p) => !hasPitcherEligibility(p.positions, p.position || "UTIL"),
      );
    } else if (viewFilter === "pitchers") {
      filtered = filtered.filter((p) =>
        hasPitcherEligibility(p.positions, p.position || "UTIL"),
      );
    }
    filtered.sort(
      (a, b) =>
        resolveValuationNumber(b, valuationSortField) -
        resolveValuationNumber(a, valuationSortField),
    );

    return { watchlistTargetTotal: targetTotal, filteredWatchlist: filtered };
  }, [effectiveWatchlist, viewFilter, targetOverrides, valuationSortField]);

  return { effectiveWatchlist, watchlistTargetTotal, filteredWatchlist };
}
