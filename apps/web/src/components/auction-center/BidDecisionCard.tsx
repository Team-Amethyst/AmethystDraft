import { useEffect } from "react";
import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import { formatDollar, valuationSortLabel, valuationTooltip } from "../../utils/valuation";
import {
  cleanedYourValueAndRecommendedBid,
  engineFiniteOrNull,
  formatSuggestedBidLine,
  valueMinusBidDeltaRounded,
  verdictFromValueMinusBid,
} from "../../domain/auctionCenterValuation";
import { AuctionMetricTile } from "./AuctionMetricTile";

function fmtMoney(n: number | null) {
  return n != null ? formatDollar(n) : "—";
}

export function BidDecisionCard({
  valuationRow,
  selectedPlayer,
}: {
  valuationRow: ValuationResult | null | undefined;
  selectedPlayer: Player;
}) {
  const row = valuationRow ?? null;

  const cleanedPair = cleanedYourValueAndRecommendedBid(row, selectedPlayer);
  const computedDelta =
    cleanedPair != null
      ? valueMinusBidDeltaRounded(cleanedPair.yourValue, cleanedPair.bid)
      : null;
  const computedVerdict =
    computedDelta != null ? verdictFromValueMinusBid(computedDelta) : null;

  const decisionData = {
    team_adjusted_value: row ? engineFiniteOrNull(row.team_adjusted_value) : null,
    recommended_bid: row ? engineFiniteOrNull(row.recommended_bid) : null,
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
  const displayAdjustedValue =
    decisionData.adjusted_value ??
    engineFiniteOrNull(selectedPlayer.adjusted_value);
  const displayBaseValue =
    decisionData.baseline_value ??
    engineFiniteOrNull(selectedPlayer.baseline_value);

  const recommendedBidDisplay =
    displayBid == null ? null : formatSuggestedBidLine(displayBid);

  return (
    <div
      className={"bid-decision-card bdc-tone--" + decisionTone}
      aria-label="Valuation"
    >
      <div className="bdc-grid">
        <div className="bdc-metric-row">
          <div
            className="bdc-metric-grid bdc-metric-grid--focus3 bdc-metric-grid--focus-boxes"
            aria-label="Suggested bid, your roster dollars, league context dollars, player strength"
          >
            <AuctionMetricTile
              label={valuationSortLabel("recommended_bid")}
              title={valuationTooltip("recommended_bid")}
              value={
                recommendedBidDisplay != null ? (
                  <span
                    className={
                      "bdc-focus-value bdc-recommended-value" +
                      (decisionDanger ? " bdc-recommended-value--danger" : "") +
                      (decisionStrong ? " bdc-recommended-value--strong" : "")
                    }
                  >
                    {recommendedBidDisplay}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <AuctionMetricTile
              label={valuationSortLabel("team_adjusted_value")}
              title={valuationTooltip("team_adjusted_value")}
              value={
                <span className="bdc-focus-value">
                  {fmtMoney(displayYour)}
                </span>
              }
            />
            <AuctionMetricTile
              label={valuationSortLabel("adjusted_value")}
              title={valuationTooltip("adjusted_value")}
              value={
                <span className="bdc-focus-value">
                  {fmtMoney(displayAdjustedValue)}
                </span>
              }
            />
            <AuctionMetricTile
              label={valuationSortLabel("baseline_value")}
              title={valuationTooltip("baseline_value")}
              value={
                <span className="bdc-focus-value">{fmtMoney(displayBaseValue)}</span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
