import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import {
  formatCurrencyWhole,
  formatDollar,
  BID_EDGE_TOOLTIP,
  leagueWideAuctionDollars,
  valuationSortLabel,
  valuationTooltip,
} from "../../utils/valuation";
import {
  cleanedYourValueAndRecommendedBid,
  commandCenterEdgeVsMaxBidRounded,
  engineFiniteOrNull,
  formatSuggestedBidLine,
  valueMinusBidDeltaRounded,
  verdictFromValueMinusBid,
} from "../../domain/auctionCenterValuation";
import { AuctionMetricTile } from "./AuctionMetricTile";
import { BidWhyThisBid } from "./BidWhyThisBid";
import { displayAuctionTier } from "../../domain/playerRankTier";
import {
  shouldShowBidLadderCellSpinner,
  type BoardValuationUiPhase,
} from "../../domain/boardValuationFetchPhase";

function fmtMoney(n: number | null) {
  return n != null ? formatDollar(n) : "—";
}

function BidLadderMetricLoading() {
  return (
    <span className="bdc-metric-value-loading" aria-busy="true" aria-label="Loading valuation">
      <Loader2 className="bdc-metric-value-loading-icon" size={20} strokeWidth={2.25} />
    </span>
  );
}

export function BidDecisionCard({
  valuationRow,
  selectedPlayer,
  engineBoardPhase = "ready",
}: {
  valuationRow: ValuationResult | null | undefined;
  selectedPlayer: Player;
  /** Engine board lifecycle for Command Center / Auction Center bid ladder placeholders. */
  engineBoardPhase?: BoardValuationUiPhase;
}) {
  const row = valuationRow ?? null;

  const cleanedPair = cleanedYourValueAndRecommendedBid(row, selectedPlayer);
  const computedDelta =
    cleanedPair != null
      ? valueMinusBidDeltaRounded(cleanedPair.yourValue, cleanedPair.bid)
      : null;
  const auctionTier = displayAuctionTier(selectedPlayer);
  const bidRelativeStar =
    typeof auctionTier === "number" &&
    auctionTier >= 1 &&
    auctionTier <= 2;
  const computedVerdict =
    computedDelta != null
      ? verdictFromValueMinusBid(computedDelta, {
          bidRelativeStar,
        })
      : null;

  const decisionData = {
    team_adjusted_value: row ? engineFiniteOrNull(row.team_adjusted_value) : null,
    recommended_bid: row ? engineFiniteOrNull(row.recommended_bid) : null,
    auction_value: row ? engineFiniteOrNull(row.auction_value) : null,
    adjusted_value: row ? engineFiniteOrNull(row.adjusted_value) : null,
    baseline_value: row ? engineFiniteOrNull(row.baseline_value) : null,
    edge: row ? engineFiniteOrNull(row.edge) : null,
  };

  useEffect(() => {
    if (row == null) return;
    if (
      decisionData.recommended_bid == null ||
      decisionData.team_adjusted_value == null
    ) {
      const cat = selectedPlayer;
      console.warn(
        "BidDecisionCard missing valuation fields (merge/API gap: no finite value on merged engine+catalog row after catalog fill)",
        {
          player_id: selectedPlayer.id,
          name: selectedPlayer.name,
          finiteRecommendedBid: decisionData.recommended_bid,
          recommended_bid: decisionData.recommended_bid,
          team_adjusted_value: decisionData.team_adjusted_value,
          adjusted_value: decisionData.adjusted_value,
          baseline_value: decisionData.baseline_value,
          edge_api: decisionData.edge,
          value_minus_bid_rounded_ui: computedDelta,
          catalog_had_finite: {
            recommended_bid:
              cat.recommended_bid != null && Number.isFinite(cat.recommended_bid),
            team_adjusted_value:
              cat.team_adjusted_value != null &&
              Number.isFinite(cat.team_adjusted_value),
            adjusted_value:
              cat.adjusted_value != null && Number.isFinite(cat.adjusted_value),
            auction_value:
              cat.auction_value != null && Number.isFinite(cat.auction_value),
            baseline_value:
              cat.baseline_value != null && Number.isFinite(cat.baseline_value),
            value: cat.value != null && Number.isFinite(cat.value),
          },
          merged_row: row,
        },
      );
    }
  }, [
    row,
    decisionData.recommended_bid,
    decisionData.team_adjusted_value,
    decisionData.adjusted_value,
    decisionData.baseline_value,
    decisionData.edge,
    computedDelta,
    selectedPlayer,
  ]);

  const decisionTone = computedVerdict?.cardTone ?? "fair";
  const decisionDanger = computedVerdict?.danger ?? false;
  const decisionStrong = computedVerdict?.strong ?? false;

  const displayBid = cleanedPair?.bid ?? decisionData.recommended_bid;
  const displayYour = cleanedPair?.yourValue ?? decisionData.team_adjusted_value;
  const displayLeagueAuction =
    (row ? leagueWideAuctionDollars(row) : undefined) ??
    leagueWideAuctionDollars(selectedPlayer);

  const recommendedBidDisplay =
    displayBid == null ? null : formatSuggestedBidLine(displayBid);

  const edgeVsMaxDisplay = commandCenterEdgeVsMaxBidRounded(
    displayYour,
    displayBid,
  );

  const auctionHasValue =
    displayLeagueAuction != null && Number.isFinite(displayLeagueAuction);
  const maxBidHasValue = recommendedBidDisplay != null;
  const teamValueHasValue = displayYour != null && Number.isFinite(displayYour);
  const bidEdgeHasValue = edgeVsMaxDisplay !== undefined;

  return (
    <div className="bdc-decision-stack">
      <div
        className={"bid-decision-card bdc-tone--" + decisionTone}
        aria-label="Bid recommendation"
      >
        <div className="bdc-grid">
          <div className="bdc-metric-row">
            <div
              className="bdc-metric-grid bdc-metric-grid--ladder4 bdc-metric-grid--focus-boxes"
              aria-label="Auction value, max bid, team value, bid edge"
            >
              <AuctionMetricTile
                label="Auction Value"
                title={valuationTooltip("auction_value")}
                value={
                  <span className="bdc-focus-value">
                    {shouldShowBidLadderCellSpinner(
                      engineBoardPhase,
                      selectedPlayer,
                      auctionHasValue,
                    ) ? (
                      <BidLadderMetricLoading />
                    ) : (
                      fmtMoney(auctionHasValue ? displayLeagueAuction : null)
                    )}
                  </span>
                }
              />
              <AuctionMetricTile
                variant="primary"
                label={valuationSortLabel("recommended_bid")}
                title={valuationTooltip("recommended_bid")}
                value={
                  maxBidHasValue ? (
                    <span
                      className={
                        "bdc-focus-value bdc-recommended-value" +
                        (decisionDanger ? " bdc-recommended-value--danger" : "") +
                        (decisionStrong ? " bdc-recommended-value--strong" : "")
                      }
                    >
                      {recommendedBidDisplay}
                    </span>
                  ) : shouldShowBidLadderCellSpinner(
                      engineBoardPhase,
                      selectedPlayer,
                      maxBidHasValue,
                    ) ? (
                    <span
                      className={
                        "bdc-focus-value bdc-recommended-value" +
                        (decisionDanger ? " bdc-recommended-value--danger" : "") +
                        (decisionStrong ? " bdc-recommended-value--strong" : "")
                      }
                    >
                      <BidLadderMetricLoading />
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <AuctionMetricTile
                label="Team Value"
                title={valuationTooltip("team_adjusted_value")}
                value={
                  <span className="bdc-focus-value">
                    {shouldShowBidLadderCellSpinner(
                      engineBoardPhase,
                      selectedPlayer,
                      teamValueHasValue,
                    ) ? (
                      <BidLadderMetricLoading />
                    ) : (
                      fmtMoney(teamValueHasValue ? displayYour : null)
                    )}
                  </span>
                }
              />
              <AuctionMetricTile
                label="Bid Edge"
                title={BID_EDGE_TOOLTIP}
                value={
                  <span className="bdc-focus-value">
                    {shouldShowBidLadderCellSpinner(
                      engineBoardPhase,
                      selectedPlayer,
                      bidEdgeHasValue,
                    ) ? (
                      <BidLadderMetricLoading />
                    ) : (
                      formatCurrencyWhole(edgeVsMaxDisplay)
                    )}
                  </span>
                }
              />
            </div>
          </div>
        </div>
      </div>
      <div className="bdc-why-wrap">
        <BidWhyThisBid valuationRow={row} selectedPlayer={selectedPlayer} />
      </div>
    </div>
  );
}
