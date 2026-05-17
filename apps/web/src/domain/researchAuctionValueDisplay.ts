import type { Player } from "../types/player";
import { formatCurrencyWhole } from "../utils/valuation";
import {
  NO_VALUATION_INELIGIBLE_DETAIL,
  NO_VALUATION_LABEL,
} from "./playerValuationCopy";

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Raw model auction dollars (two decimal places when needed). */
export function formatAuctionValueRaw(value: number | null | undefined): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  const rounded = Math.round(n * 100) / 100;
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  const body =
    Number.isInteger(abs) || Math.abs(abs - Math.round(abs)) < 1e-9
      ? `$${abs}`
      : `$${abs.toFixed(2)}`;
  return neg ? `-${body}` : body;
}

export function researchAuctionRankSubtext(
  auctionRank: number | null | undefined,
): string | null {
  const rank = coerceNumber(auctionRank);
  if (rank === undefined) return null;
  return `#${rank}`;
}

/** When to show auction rank under the value cell (Research only). */
export function showAuctionRankInResearchValueCell(args: {
  isResearchLayout: boolean;
  sortCol: string | undefined;
  showAuctionRankColumn: boolean;
}): boolean {
  if (!args.isResearchLayout) return false;
  if (!args.showAuctionRankColumn) return true;
  return args.sortCol === "value";
}

export function buildResearchAuctionValueTooltip(args: {
  baseTooltip: string;
  rawAuctionValue?: number;
  auctionRank?: number;
  roundedDisplay?: string;
}): string {
  const lines = [args.baseTooltip];
  if (args.rawAuctionValue != null && Number.isFinite(args.rawAuctionValue)) {
    lines.push(`Raw auction value: ${formatAuctionValueRaw(args.rawAuctionValue)}`);
    if (args.roundedDisplay) {
      lines.push(`Displayed (rounded): ${args.roundedDisplay}`);
    }
  }
  const rank = coerceNumber(args.auctionRank);
  if (rank !== undefined) {
    lines.push(`Auction rank #${rank}`);
  }
  return lines.join("\n");
}

export function researchAuctionValueCellTitle(args: {
  maskEngineColumns: boolean;
  valuationEligible?: boolean;
  showOutsideEnginePoolMinBidTooltip: boolean;
  outsideEnginePoolTooltip: string;
  auctionValueTooltip: string;
  rawAuctionValue?: number;
  auctionRank?: number;
  roundedDisplay?: string;
}): string {
  if (args.maskEngineColumns) return args.auctionValueTooltip;
  if (args.showOutsideEnginePoolMinBidTooltip) {
    return args.outsideEnginePoolTooltip;
  }
  if (args.valuationEligible === false) {
    return `${NO_VALUATION_LABEL}. ${NO_VALUATION_INELIGIBLE_DETAIL}`;
  }
  return buildResearchAuctionValueTooltip({
    baseTooltip: args.auctionValueTooltip,
    rawAuctionValue: args.rawAuctionValue,
    auctionRank: args.auctionRank,
    roundedDisplay: args.roundedDisplay,
  });
}

export function formatResearchAuctionValueDisplay(
  primaryValue: number | undefined,
): string {
  if (primaryValue === undefined) {
    return "";
  }
  return formatCurrencyWhole(primaryValue);
}

export type ResearchAuctionShelfAuditRow = {
  name: string;
  playerId: string;
  auctionValueRaw: number;
  displayedWhole: string;
  auctionRank: number | null;
  surplusBasis: string | null;
  auctionTier: number | null;
};

export function buildResearchAuctionShelfAuditRows(
  players: readonly Player[],
  limit = 25,
): ResearchAuctionShelfAuditRow[] {
  const valued = players
    .filter(
      (p) =>
        p.valuation_eligible !== false &&
        coerceNumber(p.auction_value) !== undefined,
    )
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0))
    .slice(0, limit);

  return valued.map((p) => ({
    name: p.name,
    playerId: p.id,
    auctionValueRaw: p.auction_value!,
    displayedWhole: formatCurrencyWhole(p.auction_value),
    auctionRank: coerceNumber(p.auction_rank) ?? null,
    surplusBasis: p.valuation_explain?.surplus_basis ?? null,
    auctionTier: coerceNumber(p.auction_tier) ?? null,
  }));
}

export function summarizeAuctionValueShelfSpread(
  rows: readonly ResearchAuctionShelfAuditRow[],
): {
  uniqueRawCount: number;
  uniqueDisplayedCount: number;
  rawMin: number;
  rawMax: number;
  mostlyRounding: boolean;
} {
  if (rows.length === 0) {
    return {
      uniqueRawCount: 0,
      uniqueDisplayedCount: 0,
      rawMin: 0,
      rawMax: 0,
      mostlyRounding: false,
    };
  }
  const raws = rows.map((r) => r.auctionValueRaw);
  const displayed = rows.map((r) => r.displayedWhole);
  const uniqueRaw = new Set(raws.map((r) => Math.round(r * 100) / 100));
  const uniqueDisplayed = new Set(displayed);
  const rawMin = Math.min(...raws);
  const rawMax = Math.max(...raws);
  const mostlyRounding =
    uniqueRaw.size > uniqueDisplayed.size && rawMax - rawMin >= 0.5;
  return {
    uniqueRawCount: uniqueRaw.size,
    uniqueDisplayedCount: uniqueDisplayed.size,
    rawMin,
    rawMax,
    mostlyRounding,
  };
}
