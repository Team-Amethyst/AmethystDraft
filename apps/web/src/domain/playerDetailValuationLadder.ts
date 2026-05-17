import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";
import {
  cleanedYourValueAndRecommendedBid,
  commandCenterEdgeVsMaxBidRounded,
  engineFiniteOrNull,
  mergeDisplayValuationRow,
} from "./auctionCenterValuation";
import { leagueWideAuctionDollars } from "../utils/valuation";

/** Money ladder for Player Detail — same contract fields as Command Center bid card. */
export type PlayerDetailValuationLadder = {
  auctionValue: number | null;
  recommendedBid: number | null;
  teamValue: number | null;
  maxBid: number | null;
  /** Rounded Team Value − Recommended Bid (matches Command Center Bid Edge). */
  bidEdge: number | undefined;
  /** When true, omit Max Bid from the top metric strip (still shown under Why this value). */
  maxBidEqualsRecommended: boolean;
};

/**
 * Builds the Research / Player Detail valuation strip from merged engine + catalog fields.
 * Does not read legacy `adjusted_value` / `team_adjusted_value`; uses `auction_value`, etc.
 */
export function buildPlayerDetailValuationLadder(
  player: Player,
  valuationRow?: ValuationResult | null,
): PlayerDetailValuationLadder {
  const merged = mergeDisplayValuationRow(valuationRow ?? undefined, player);
  const row = merged ?? valuationRow ?? undefined;

  const auctionValue =
    leagueWideAuctionDollars(row ?? player) ?? null;
  const auctionFinite =
    auctionValue != null && Number.isFinite(auctionValue) ? auctionValue : null;

  const pair = cleanedYourValueAndRecommendedBid(row, player);
  const recommendedBid = pair?.bid ?? engineFiniteOrNull(player.recommended_bid);
  const teamValue = pair?.yourValue ?? engineFiniteOrNull(player.team_value);

  const maxBid =
    engineFiniteOrNull(row?.max_bid) ?? engineFiniteOrNull(player.max_bid);

  const bidEdge = commandCenterEdgeVsMaxBidRounded(teamValue, recommendedBid);

  const maxBidEqualsRecommended =
    recommendedBid != null &&
    maxBid != null &&
    Math.round(recommendedBid) === Math.round(maxBid);

  return {
    auctionValue: auctionFinite,
    recommendedBid,
    teamValue,
    maxBid,
    bidEdge,
    maxBidEqualsRecommended,
  };
}
