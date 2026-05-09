import type { StatBasis } from "@repo/player-stat-basis";
import type { DisplayBatting, DisplayPitching } from "@repo/player-stat-basis";
import { getDisplayStatValue } from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import { leagueWideAuctionDollars, type ValuationSortField } from "../utils/valuation";

function asFinite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export type PlayerTableSortableRow = {
  player: Player;
  bat?: DisplayBatting;
  pit?: DisplayPitching;
  isBatter: boolean;
  valDiff: number | undefined;
  tags: string[];
};

/**
 * Client-side sort for the research player table (ADP, tier, valuation fields, stat columns).
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
    if (col === "adp") return mult * (a.player.adp - b.player.adp);
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
    if (col === "tier") return mult * (a.player.tier - b.player.tier);
    if (col === "valdiff") {
      const av = a.valDiff ?? -Infinity;
      const bv = b.valDiff ?? -Infinity;
      return mult * (av - bv);
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
