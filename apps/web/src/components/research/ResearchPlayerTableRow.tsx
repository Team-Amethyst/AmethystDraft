import type { ReactNode } from "react";
import { Star } from "lucide-react";
import {
  getCategoryTags,
  resolveDisplayStats,
  type StatBasis,
} from "@repo/player-stat-basis";
import type { Player } from "../../types/player";
import PosBadge from "../PosBadge";
import { PlayerHeadshot } from "../PlayerTableParts";
import {
  buildResearchPlayerMetaBadgeItems,
  ResearchPlayerMetaBadges,
} from "../ResearchPlayerMetaBadges";
import { researchPlayerCellTooltip } from "../../domain/researchPlayerCellTooltip";
import { researchTablePrimaryPositionParts } from "../../utils/eligibility";
import {
  formatResearchAuctionValueDisplay,
  researchAuctionValueCellTitle,
} from "../../domain/researchAuctionValueDisplay";
import {
  formatCurrencyWhole,
  RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE,
  RESEARCH_TABLE_TOOLTIP_TEAM_VALUE,
  valuationTooltip,
} from "../../utils/valuation";
import { researchTableAuctionDollars } from "../../domain/researchDraftedDisplay";
import { marketAdpDetailTooltip } from "../../domain/rankTierLabels";
import {
  shouldShowOutsideDraftableMinBidTooltip,
  TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID,
} from "../../domain/draftablePoolSemantics";
import { catalogPlayerIdInStringSet } from "../../domain/catalogPlayerKeys";

export type ResearchPlayerTableRowProps = {
  player: Player;
  statBasis?: StatBasis;
  draftDisplaySlotKeys?: readonly string[] | null;
  isCustomPlayer?: boolean;
  draftedTeamName?: string;
  draftedContractLabel?: string;
  draftedIds?: ReadonlySet<string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
  isStarred?: boolean;
  onPlayerClick?: (player: Player) => void;
  onToggleWatchlist?: (player: Player) => void;
  showMarketAdp?: boolean;
  showAuctionRank?: boolean;
  showRecommendedBid?: boolean;
  showTeamValue?: boolean;
  /** Rendered after the auction value column (e.g. Command Center action). */
  trailingCells?: ReactNode;
};

export function ResearchPlayerTableRow({
  player,
  statBasis = "projections",
  draftDisplaySlotKeys,
  isCustomPlayer = false,
  draftedTeamName,
  draftedContractLabel,
  draftedIds,
  draftedPriceByPlayerId,
  draftedContractByPlayerId,
  isStarred = false,
  onPlayerClick,
  onToggleWatchlist,
  showMarketAdp = false,
  showAuctionRank = true,
  showRecommendedBid = false,
  showTeamValue = false,
  trailingCells,
}: ResearchPlayerTableRowProps) {
  const { bat, pit } = resolveDisplayStats(player, statBasis);
  const tags = getCategoryTags(bat, pit);
  const isDrafted =
    draftedIds != null &&
    catalogPlayerIdInStringSet(draftedIds, player);

  const primaryValue = researchTableAuctionDollars(player, {
    draftedIds,
    draftedPriceByPlayerId,
    draftedContractByPlayerId,
  });
  const showMinBidOutsidePoolTooltip = shouldShowOutsideDraftableMinBidTooltip({
    draftable: player.research_draftable ?? "unknown",
    auctionDollars: primaryValue,
    valuationEligible: player.valuation_eligible,
  });
  const roundedDisplay =
    primaryValue != null
      ? formatResearchAuctionValueDisplay(primaryValue)
      : undefined;
  const valueCellTitle = researchAuctionValueCellTitle({
    maskEngineColumns: false,
    valuationEligible: player.valuation_eligible,
    showOutsideEnginePoolMinBidTooltip: showMinBidOutsidePoolTooltip,
    outsideEnginePoolTooltip: TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID,
    auctionValueTooltip: RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE,
    rawAuctionValue: primaryValue ?? undefined,
    auctionRank: player.auction_rank,
    roundedDisplay,
  });
  const playerCellTitle = researchPlayerCellTooltip({
    playerName: player.name,
    tags,
    isCustom: isCustomPlayer,
    draftedTeamName,
    draftedContractLabel,
    maskEngineColumns: false,
    researchDraftable: player.research_draftable,
  });
  const researchMetaBadgeItems = buildResearchPlayerMetaBadgeItems({
    tags,
    isCustom: isCustomPlayer,
    draftedTeamName,
    draftedContractLabel,
  });
  const positionParts = researchTablePrimaryPositionParts(
    player,
    draftDisplaySlotKeys ?? null,
  );

  return (
    <tr
      className={
        "pt-row" +
        (isStarred ? " pt-row--starred" : "") +
        (isDrafted ? " pt-row--drafted" : "") +
        (onPlayerClick ? " pt-row--clickable" : "") +
        (player.research_draftable === "outside"
          ? " pt-row--research-outside-draftable"
          : "")
      }
      onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
    >
      <td className="td-star" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={"btn-star " + (isStarred ? "starred" : "")}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist?.(player);
          }}
          title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
          aria-label={
            isStarred
              ? `Remove ${player.name} from watchlist`
              : `Add ${player.name} to watchlist`
          }
        >
          <Star size={15} fill={isStarred ? "#fbbf24" : "none"} />
        </button>
      </td>

      <td className="td-player">
        <div
          className="player-cell player-cell--research"
          title={playerCellTitle}
        >
          <PlayerHeadshot
            src={player.headshot}
            name={player.name}
            isCustom={isCustomPlayer}
          />
          <div className="player-name-col player-name-col--research">
            <div className="pt-research-player-top">
              <span className="player-name">{player.name}</span>
              {player.injuryStatus ? (
                <span className="pt-il-badge">
                  {player.injuryStatus.replace("DL", "IL")}
                </span>
              ) : null}
            </div>
            <ResearchPlayerMetaBadges items={researchMetaBadgeItems} />
          </div>
        </div>
      </td>

      <td className="td-pos">
        {positionParts.length === 0 ? (
          <span className="td-pos-empty">—</span>
        ) : positionParts.length === 1 ? (
          <PosBadge pos={positionParts[0]} />
        ) : (
          <div className="pt-pos-badges pt-pos-badges--research">
            {positionParts.map((pos) => (
              <PosBadge key={`${player.id}-pos-${pos}`} pos={pos} />
            ))}
          </div>
        )}
      </td>

      <td className="td-team">{player.team}</td>

      {showMarketAdp ? (
        <td
          className="td-rank-metric td-adp"
          title={marketAdpDetailTooltip(player)}
        >
          {typeof player.market_adp === "number" &&
          Number.isFinite(player.market_adp)
            ? player.market_adp
            : "—"}
        </td>
      ) : null}

      {showAuctionRank ? (
        <td className="td-auction-rank td-rank-metric">
          {typeof player.auction_rank === "number" &&
          Number.isFinite(player.auction_rank)
            ? player.auction_rank
            : "—"}
        </td>
      ) : null}

      <td className="td-value">
        <div className="pt-value-stack">
          <span className="pt-value-stack__primary" title={valueCellTitle}>
            {formatResearchAuctionValueDisplay(primaryValue)}
          </span>
        </div>
      </td>

      {showRecommendedBid ? (
        <td
          className="td-value td-tier-bid"
          title={valuationTooltip("recommended_bid")}
        >
          {formatCurrencyWhole(player.recommended_bid)}
        </td>
      ) : null}

      {showTeamValue ? (
        <td
          className="td-value td-tier-team-value"
          title={RESEARCH_TABLE_TOOLTIP_TEAM_VALUE}
        >
          {formatCurrencyWhole(player.team_value)}
        </td>
      ) : null}

      {trailingCells}
    </tr>
  );
}
