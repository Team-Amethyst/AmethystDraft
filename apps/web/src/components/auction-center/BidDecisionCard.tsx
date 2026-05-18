import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import {
  formatDollar,
  formatSignedDollarWhole,
  COMMAND_CENTER_BID_EDGE_TOOLTIP,
  COMMAND_CENTER_TOOLTIP_AUCTION_VALUE,
  COMMAND_CENTER_TOOLTIP_SUGGESTED_BID,
  COMMAND_CENTER_TOOLTIP_TEAM_VALUE,
  leagueWideAuctionDollars,
  valuationSortLabel,
  recommendedBidTileLabel,
  recommendedBidTileTooltip,
  commandCenterBidDecision,
  type CommandCenterWalletCaps,
} from "../../utils/valuation";
import {
  cleanedYourValueAndRecommendedBid,
  commandCenterEdgeVsMaxBidRounded,
  engineFiniteOrNull,
  formatSuggestedBidLine,
  valueMinusBidDeltaRounded,
} from "../../domain/auctionCenterValuation";
import { AuctionMetricTile } from "./AuctionMetricTile";
import { BidWhyThisBid } from "./BidWhyThisBid";
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
  walletCaps = null,
}: {
  valuationRow: ValuationResult | null | undefined;
  selectedPlayer: Player;
  /** Engine board lifecycle for Command Center / Auction Center bid ladder placeholders. */
  engineBoardPhase?: BoardValuationUiPhase;
  /** When set, recommended bid display is capped to executable roster budget (Command Center). */
  walletCaps?: CommandCenterWalletCaps | null;
}) {
  const row = valuationRow ?? null;

  const bidDecision =
    row != null
      ? commandCenterBidDecision(row, undefined, walletCaps ?? null)
      : null;

  const cleanedPair = cleanedYourValueAndRecommendedBid(row, selectedPlayer);
  const displayBidFromCaps =
    bidDecision != null &&
    !bidDecision.notBidable &&
    Number.isFinite(bidDecision.suggestedBid)
      ? bidDecision.suggestedBid
      : null;
  const displayBid =
    displayBidFromCaps ?? cleanedPair?.bid ?? row?.recommended_bid ?? null;
  const displayYour =
    cleanedPair?.yourValue ??
    (row ? engineFiniteOrNull(row.team_value) : null);

  const computedDelta =
    displayYour != null && displayBid != null
      ? valueMinusBidDeltaRounded(displayYour, displayBid)
      : null;

  const edgeVsMaxDisplay = commandCenterEdgeVsMaxBidRounded(
    displayYour,
    displayBid,
  );

  const decisionData = {
    team_value: row ? engineFiniteOrNull(row.team_value) : null,
    recommended_bid: row ? engineFiniteOrNull(row.recommended_bid) : null,
    auction_value: row ? engineFiniteOrNull(row.auction_value) : null,
    baseline_value: row ? engineFiniteOrNull(row.baseline_value) : null,
    edge: row ? engineFiniteOrNull(row.edge) : null,
  };

  useEffect(() => {
    if (row == null) return;
    if (
      decisionData.recommended_bid == null ||
      decisionData.team_value == null
    ) {
      const cat = selectedPlayer;
      console.warn(
        "BidDecisionCard missing valuation fields (merge/API gap: no finite value on merged engine+catalog row after catalog fill)",
        {
          player_id: selectedPlayer.id,
          name: selectedPlayer.name,
          finiteRecommendedBid: decisionData.recommended_bid,
          recommended_bid: decisionData.recommended_bid,
          team_value: decisionData.team_value,
          auction_value: decisionData.auction_value,
          baseline_value: decisionData.baseline_value,
          edge_api: decisionData.edge,
          value_minus_bid_rounded_ui: computedDelta,
          catalog_had_finite: {
            recommended_bid:
              cat.recommended_bid != null && Number.isFinite(cat.recommended_bid),
            team_value:
              cat.team_value != null &&
              Number.isFinite(cat.team_value),
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
    decisionData.team_value,
    decisionData.auction_value,
    decisionData.baseline_value,
    decisionData.edge,
    computedDelta,
    selectedPlayer,
    walletCaps,
  ]);

  const displayLeagueAuction = row ? leagueWideAuctionDollars(row) : undefined;

  const recommendedBidDisplay =
    displayBid == null ? null : formatSuggestedBidLine(displayBid);

  const budgetLimited = bidDecision?.budgetLimited ?? false;
  const recommendedBidLabel = recommendedBidTileLabel(budgetLimited);
  const recommendedBidTitle = recommendedBidTileTooltip({
    budgetLimited,
    displayBid,
    uncappedBid: bidDecision?.baseUncapped ?? null,
  });

  const auctionHasValue =
    displayLeagueAuction != null && Number.isFinite(displayLeagueAuction);
  const maxBidHasValue = recommendedBidDisplay != null;
  const teamValueHasValue = displayYour != null && Number.isFinite(displayYour);
  const bidEdgeHasValue = edgeVsMaxDisplay !== undefined;

  const bidEdgeTone =
    edgeVsMaxDisplay == null
      ? "muted"
      : edgeVsMaxDisplay > 0
        ? "pos"
        : edgeVsMaxDisplay < 0
          ? "neg"
          : "zero";

  return (
    <div className="bdc-decision-stack">
      <div className="bid-decision-card" aria-label="Bid recommendation">
        <div className="bdc-grid">
          <div className="bdc-metric-row">
            <div
              className="bdc-metric-grid bdc-metric-grid--ladder4 bdc-metric-grid--focus-boxes"
              aria-label="Auction value, suggested bid, your team value, bid edge"
            >
              <AuctionMetricTile
                label={valuationSortLabel("auction_value")}
                title={COMMAND_CENTER_TOOLTIP_AUCTION_VALUE}
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
                label={recommendedBidLabel}
                title={
                  budgetLimited
                    ? recommendedBidTitle
                    : COMMAND_CENTER_TOOLTIP_SUGGESTED_BID
                }
                value={
                  maxBidHasValue ? (
                    <span className="bdc-focus-value">{recommendedBidDisplay}</span>
                  ) : shouldShowBidLadderCellSpinner(
                      engineBoardPhase,
                      selectedPlayer,
                      maxBidHasValue,
                    ) ? (
                    <span className="bdc-focus-value">
                      <BidLadderMetricLoading />
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <AuctionMetricTile
                label={valuationSortLabel("team_value")}
                title={COMMAND_CENTER_TOOLTIP_TEAM_VALUE}
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
                label="Bid edge"
                title={COMMAND_CENTER_BID_EDGE_TOOLTIP}
                value={
                  <span
                    className={
                      "bdc-focus-value bdc-context-edge bdc-context-edge--" +
                      bidEdgeTone
                    }
                  >
                    {shouldShowBidLadderCellSpinner(
                      engineBoardPhase,
                      selectedPlayer,
                      bidEdgeHasValue,
                    ) ? (
                      <BidLadderMetricLoading />
                    ) : (
                      formatSignedDollarWhole(edgeVsMaxDisplay)
                    )}
                  </span>
                }
              />
            </div>
          </div>
        </div>
      </div>
      <div className="bdc-why-wrap">
        <BidWhyThisBid
          valuationRow={row}
          selectedPlayer={selectedPlayer}
          displayBid={displayBid}
          displayYour={displayYour}
          notBidable={bidDecision?.notBidable ?? false}
          notBidableReason={bidDecision?.notBidableReason ?? null}
          budgetLimited={bidDecision?.budgetLimited}
        />
      </div>
    </div>
  );
}
