import type { StatBasis } from "@repo/player-stat-basis";
import type { DisplayBatting, DisplayPitching } from "@repo/player-stat-basis";
import { getDisplayStatValue } from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import { displayAuctionTier } from "./playerRankTier";
import { leagueWideAuctionDollars, type ValuationSortField } from "../utils/valuation";

function asFinite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function sortWithMissingLast(
  a: number | undefined,
  b: number | undefined,
  mult: number,
): number {
  const big = 1e12;
  const va = a ?? big;
  const vb = b ?? big;
  return mult * (va - vb);
}

export type PlayerTableSortableRow = {
  player: Player;
  bat?: DisplayBatting;
  pit?: DisplayPitching;
  isBatter: boolean;
  tags: string[];
};

/**
 * Client-side sort (model rank, auction rank/tier, valuation $, stat columns).
 */
export function sortPlayerTableRows(
  rows: PlayerTableSortableRow[],
  clientSort: { col: string; dir: "asc" | "desc" },
  batCols: string[],
  pitCols: string[],
  valuationSortField: ValuationSortField,
  statBasis: StatBasis,
): PlayerTableSortableRow[] {
  const { col, dir } = clientSort;
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (col === "adp" || col === "catalog_rank")
      return mult * (a.player.catalog_rank - b.player.catalog_rank);
    if (col === "auction_rank")
      return sortWithMissingLast(
        asFinite(a.player.auction_rank),
        asFinite(b.player.auction_rank),
        mult,
      );
    if (col === "market_adp")
      return sortWithMissingLast(
        asFinite(a.player.market_adp),
        asFinite(b.player.market_adp),
        mult,
      );
    if (col === "tier" || col === "auction_tier") {
      const ta = displayAuctionTier(a.player);
      const tb = displayAuctionTier(b.player);
      return mult * ((ta ?? 999) - (tb ?? 999));
    }
    if (col === "value") {
      const sortKey = (p: Player) => {
        if (valuationSortField === "auction_value") {
          return leagueWideAuctionDollars(p) ?? -Infinity;
        }
        if (valuationSortField === "recommended_bid") {
          return asFinite(p.recommended_bid) ?? -Infinity;
        }
        if (valuationSortField === "team_adjusted_value") {
          return asFinite(p.team_adjusted_value) ?? -Infinity;
        }
        return asFinite(p[valuationSortField]) ?? -Infinity;
      };
      return mult * (sortKey(a.player) - sortKey(b.player));
    }
    if (col.startsWith("stat-")) {
      const i = parseInt(col.slice(5), 10);
      const aStat = a.isBatter ? batCols[i] : pitCols[i];
      const bStat = b.isBatter ? batCols[i] : pitCols[i];
      const aRaw = aStat
        ? getDisplayStatValue(
            aStat,
            a.isBatter ? "batting" : "pitching",
            a.bat,
            a.pit,
            a.player,
            statBasis,
          )
        : "-";
      const bRaw = bStat
        ? getDisplayStatValue(
            bStat,
            b.isBatter ? "batting" : "pitching",
            b.bat,
            b.pit,
            b.player,
            statBasis,
          )
        : "-";
      const aP = parseFloat(aRaw);
      const bP = parseFloat(bRaw);
      return (
        mult * ((isNaN(aP) ? -Infinity : aP) - (isNaN(bP) ? -Infinity : bP))
      );
    }
    return 0;
  });
}
