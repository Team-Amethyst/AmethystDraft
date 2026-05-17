import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import { formatDollar } from "../utils/valuation";
import { mergeDisplayValuationRow } from "./auctionCenterValuation";

export type BidDecisionPlainSummary = {
  headline: string;
  detail: string;
};

/**
 * User-facing one-liner for Command Center “Why this bid?” — not raw engine notes.
 */
export function buildBidDecisionPlainSummary(params: {
  valuationRow: ValuationResult | null | undefined;
  selectedPlayer: Player;
  leagueFmv: number | null;
  suggestedBid: number | null;
  teamValue: number | null;
  bidEdge: number | undefined;
  notBidable: boolean;
  notBidableReason: string | null;
  budgetLimited?: boolean;
}): BidDecisionPlainSummary | null {
  const {
    leagueFmv,
    suggestedBid,
    teamValue,
    bidEdge,
    notBidable,
    notBidableReason,
    budgetLimited,
  } = params;

  if (notBidable) {
    return {
      headline: "You should not bid on this player right now.",
      detail:
        notBidableReason ??
        "Your selected team has no executable budget or open active roster slots.",
    };
  }

  if (suggestedBid == null) {
    return null;
  }

  const bidText = formatDollar(Math.round(suggestedBid));
  const fmvText =
    leagueFmv != null ? formatDollar(Math.round(leagueFmv)) : null;

  if (
    fmvText != null &&
    leagueFmv != null &&
    suggestedBid >= leagueFmv + 12
  ) {
    const premium = Math.round(suggestedBid - leagueFmv);
    return {
      headline: `Treat ${bidText} as a reach bid unless you need the roster fit.`,
      detail: `Auction value is about ${fmvText}—the model suggests paying roughly $${premium} more because of your team needs and remaining budget.`,
    };
  }

  if (bidEdge != null && bidEdge < -10) {
    return {
      headline: `${bidText} is aggressive relative to what this player is worth to you.`,
      detail:
        teamValue != null
          ? `Your team value is about ${formatDollar(Math.round(teamValue))}; bidding here leaves little margin if you win.`
          : "The suggested offer is at or above your team-specific value.",
    };
  }

  if (bidEdge != null && bidEdge > 8) {
    return {
      headline: `${bidText} is a sensible target with room to spare.`,
      detail:
        fmvText != null
          ? `Auction value is about ${fmvText}. You retain roughly $${bidEdge} of roster value if you land the player near this price.`
          : `You retain about $${bidEdge} of roster value versus your team-specific worth at this price.`,
    };
  }

  if (budgetLimited) {
    return {
      headline: `${bidText} is the most you can legally offer with your current budget and open slots.`,
      detail:
        fmvText != null
          ? `Auction value is about ${fmvText}. Wallet caps—not player quality—are binding the suggested bid.`
          : "Remaining budget and open active roster spots cap this offer.",
    };
  }

  return {
    headline: `Aim near ${bidText} unless the room runs hot.`,
    detail:
      fmvText != null
        ? `Auction value is about ${fmvText}. Team-specific need and inflation can move the actionable price above or below that benchmark.`
        : "Use auction value as context; your roster needs set the actionable price.",
  };
}

export function plainSummaryFromMergedRow(
  valuationRow: ValuationResult | null | undefined,
  selectedPlayer: Player,
  display: {
    leagueFmv: number | null;
    suggestedBid: number | null;
    teamValue: number | null;
    bidEdge: number | undefined;
    notBidable: boolean;
    notBidableReason: string | null;
    budgetLimited?: boolean;
  },
): BidDecisionPlainSummary | null {
  const merged = mergeDisplayValuationRow(valuationRow ?? undefined, selectedPlayer);
  void merged;
  return buildBidDecisionPlainSummary({
    valuationRow,
    selectedPlayer,
    ...display,
  });
}
