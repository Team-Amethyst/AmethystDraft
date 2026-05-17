import { Star } from "lucide-react";
import {
  getCategoryTags,
  getDisplayStatValue,
  resolveDisplayStats,
  type StatBasis,
} from "@repo/player-stat-basis";
import type { Player } from "../../types/player";
import PosBadge from "../PosBadge";
import { NoteCell, PlayerHeadshot } from "../PlayerTableParts";
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
  RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE,
} from "../../utils/valuation";
import { marketAdpDetailTooltip } from "../../domain/rankTierLabels";
import {
  shouldShowOutsideDraftableMinBidTooltip,
  TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID,
} from "../../domain/draftablePoolSemantics";
import {
  catalogPlayerIdInStringSet,
  lookupRosterMapForCatalogPlayer,
} from "../../domain/catalogPlayerKeys";
import {
  researchTableAuctionDollars,
  resolveResearchDraftedRowDisplay,
} from "../../domain/researchDraftedDisplay";
import { ResearchDraftedPaidCell } from "./ResearchDraftedPaidCell";
import {
  researchTableNumericCell,
  researchTableTextCell,
  type ResearchTableStatView,
} from "../../domain/researchPlayerTableLayout";

export type TierExpandedPlayerRowProps = {
  player: Player;
  listRank: number;
  statBasis?: StatBasis;
  statView?: ResearchTableStatView;
  scoringCategories?: { name: string; type: string }[];
  batCols: readonly string[];
  pitCols: readonly string[];
  focusedCols: readonly string[] | null;
  focusedType: "batting" | "pitching" | null;
  numStatCols: number;
  draftDisplaySlotKeys?: readonly string[] | null;
  isCustomPlayer?: boolean;
  draftedIds?: ReadonlySet<string>;
  draftedByTeam?: ReadonlyMap<string, string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
  isStarred?: boolean;
  onPlayerClick?: (player: Player) => void;
  onToggleWatchlist?: (player: Player) => void;
  showMarketAdp?: boolean;
  showAuctionRank?: boolean;
  getNote?: (playerId: string) => string;
  onNoteChange?: (playerId: string, note: string) => void;
};

export function TierExpandedPlayerRow({
  player,
  listRank,
  statBasis = "projections",
  draftDisplaySlotKeys,
  isCustomPlayer = false,
  draftedIds,
  draftedByTeam,
  draftedPriceByPlayerId,
  draftedContractByPlayerId,
  isStarred = false,
  onPlayerClick,
  onToggleWatchlist,
  showMarketAdp = false,
  showAuctionRank = true,
  batCols,
  pitCols,
  focusedCols,
  focusedType,
  numStatCols,
  getNote,
  onNoteChange,
}: TierExpandedPlayerRowProps) {
  const { bat, pit } = resolveDisplayStats(player, statBasis);
  const tags = getCategoryTags(bat, pit);
  const isBatter = Boolean(bat && Object.keys(bat).length > 0);
  const isDrafted =
    draftedIds != null && catalogPlayerIdInStringSet(draftedIds, player);

  const draftedTeamName = draftedByTeam
    ? lookupRosterMapForCatalogPlayer(draftedByTeam, player)
    : undefined;
  const draftedContractLabel = draftedContractByPlayerId
    ? lookupRosterMapForCatalogPlayer(draftedContractByPlayerId, player)
    : undefined;

  const draftedDisplay = resolveResearchDraftedRowDisplay(
    player,
    draftedIds,
    draftedByTeam,
    draftedPriceByPlayerId,
  );

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
    draftedTeamName: draftedDisplay ? undefined : draftedTeamName,
    draftedContractLabel: draftedDisplay ? undefined : draftedContractLabel,
    maskEngineColumns: false,
    researchDraftable: player.research_draftable,
  });

  const researchMetaBadgeItems = buildResearchPlayerMetaBadgeItems({
    tags,
    isCustom: isCustomPlayer,
    draftedTeamName: draftedDisplay ? undefined : draftedTeamName,
    draftedContractLabel: draftedDisplay ? undefined : draftedContractLabel,
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
        (isDrafted ? " pt-row--research-drafted" : "") +
        (onPlayerClick ? " pt-row--clickable" : "") +
        (player.research_draftable === "outside"
          ? " pt-row--research-outside-draftable"
          : "")
      }
      onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
    >
      <td className="td-rank">{listRank}</td>

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
          {researchTableNumericCell(player.market_adp)}
        </td>
      ) : null}

      {showAuctionRank ? (
        <td className="td-auction-rank td-rank-metric">
          {researchTableNumericCell(player.auction_rank)}
        </td>
      ) : null}

      <td
        className="td-value"
        title={draftedDisplay ? draftedDisplay.title : valueCellTitle}
      >
        {draftedDisplay ? (
          <ResearchDraftedPaidCell display={draftedDisplay} />
        ) : (
          <div className="pt-value-stack">
            <span className="pt-value-stack__primary">
              {formatResearchAuctionValueDisplay(primaryValue)}
            </span>
          </div>
        )}
      </td>

      {focusedCols
        ? focusedCols.map((col, i) => (
            <td key={i} className={i === 0 ? "td-avg td-stat" : "td-stat"}>
              {researchTableTextCell(
                getDisplayStatValue(col, focusedType!, bat, pit, player, statBasis),
              )}
            </td>
          ))
        : Array.from({ length: numStatCols }, (_, i) => (
            <td key={i} className={i === 0 ? "td-avg td-stat" : "td-stat"}>
              {isBatter
                ? batCols[i]
                  ? researchTableTextCell(
                      getDisplayStatValue(
                        batCols[i],
                        "batting",
                        bat,
                        pit,
                        player,
                        statBasis,
                      ),
                    )
                  : null
                : pitCols[i]
                  ? researchTableTextCell(
                      getDisplayStatValue(
                        pitCols[i],
                        "pitching",
                        bat,
                        pit,
                        player,
                        statBasis,
                      ),
                    )
                  : null}
            </td>
          ))}

      <td className="td-notes" onClick={(e) => e.stopPropagation()}>
        {getNote && onNoteChange ? (
          <NoteCell
            playerId={player.id}
            playerName={player.name}
            tags={tags}
            getNote={getNote}
            onNoteChange={onNoteChange}
          />
        ) : null}
      </td>
    </tr>
  );
}
