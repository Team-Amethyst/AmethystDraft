import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import type { AuctionCenterCategoryImpactRow } from "../../pages/command-center-utils/categoryImpactRows";
import {
  AUCTION_RANK_TOOLTIP,
  marketAdpDetailTooltip,
  MODEL_RANK_TOOLTIP,
} from "../../domain/rankTierLabels";
import { displayAuctionTier } from "../../domain/playerRankTier";
import type { BoardValuationUiPhase } from "../../domain/boardValuationFetchPhase";
import { AuctionCenterPlayerImpact } from "./AuctionCenterPlayerImpact";
import { BidDecisionCard } from "./BidDecisionCard";
import { PlayerIdentityCard } from "./PlayerIdentityCard";

interface AuctionCenterPlayerStackProps {
  selectedPlayer: Player;
  mergedValuationRow: ValuationResult | undefined;
  rowForValuationUi: ValuationResult | undefined;
  identityValueVsBidBadge: {
    deltaText: string;
    label: string;
    tone: "pos" | "neg" | "muted";
  } | null;
  getNote: (id: string) => string;
  setNote: (id: string, value: string) => void;
  isInWatchlist: (id: string) => boolean;
  statView: "hitting" | "pitching";
  onStatViewChange: (v: "hitting" | "pitching") => void;
  catImpactRows: AuctionCenterCategoryImpactRow[];
  pitchingCats: { name: string; type: "batting" | "pitching" }[];
  hittingCats: { name: string; type: "batting" | "pitching" }[];
  engineBoardPhase: BoardValuationUiPhase;
}

export function AuctionCenterPlayerStack({
  selectedPlayer,
  mergedValuationRow,
  rowForValuationUi,
  identityValueVsBidBadge,
  getNote,
  setNote,
  isInWatchlist,
  statView,
  onStatViewChange,
  catImpactRows,
  pitchingCats,
  hittingCats,
  engineBoardPhase,
}: AuctionCenterPlayerStackProps) {
  const rowUi = mergedValuationRow;
  const rawEngineTier = rowUi?.auction_tier ?? rowUi?.tier;
  const tierFromRow =
    typeof rawEngineTier === "number" &&
    Number.isFinite(rawEngineTier) &&
    rawEngineTier > 0
      ? rawEngineTier
      : undefined;
  const tierValue =
    tierFromRow ??
    displayAuctionTier(selectedPlayer) ??
    selectedPlayer.catalog_tier;

  const marketAdp = rowUi?.market_adp ?? selectedPlayer.market_adp;
  const auctionRank =
    rowUi?.auction_rank ?? selectedPlayer.auction_rank;

  let rankLabel: string;
  let rankValue: number;
  let rankTitle: string;
  if (typeof marketAdp === "number" && Number.isFinite(marketAdp)) {
    rankLabel = "Market ADP";
    rankValue = marketAdp;
    rankTitle = marketAdpDetailTooltip({
      market_adp_source:
        rowUi?.market_adp_source ?? selectedPlayer.market_adp_source,
      market_adp_updated_at:
        rowUi?.market_adp_updated_at ?? selectedPlayer.market_adp_updated_at,
      market_adp_min: rowUi?.market_adp_min ?? selectedPlayer.market_adp_min,
      market_adp_max: rowUi?.market_adp_max ?? selectedPlayer.market_adp_max,
      market_pick_count:
        rowUi?.market_pick_count ?? selectedPlayer.market_pick_count,
    });
  } else if (typeof auctionRank === "number" && Number.isFinite(auctionRank)) {
    rankLabel = "Auction rank";
    rankValue = auctionRank;
    rankTitle = AUCTION_RANK_TOOLTIP;
  } else {
    rankLabel = "Model rank";
    rankValue = selectedPlayer.catalog_rank;
    rankTitle = MODEL_RANK_TOOLTIP;
  }

  return (
    <>
      <PlayerIdentityCard
        selectedPlayer={selectedPlayer}
        tierValue={tierValue}
        rankLabel={rankLabel}
        rankValue={rankValue}
        rankTitle={rankTitle}
        valueVsBidBadge={identityValueVsBidBadge}
        isInWatchlist={isInWatchlist}
        playerNote={
          (getNote(selectedPlayer.id) || selectedPlayer.outlook) ?? ""
        }
        setPlayerNote={(value) => setNote(selectedPlayer.id, value)}
      />
      <AuctionCenterPlayerImpact
        selectedPlayer={selectedPlayer}
        statView={statView}
        onStatViewChange={onStatViewChange}
        catImpactRows={catImpactRows}
        pitchingCats={pitchingCats}
        hittingCats={hittingCats}
      />
      <section className="pac-bid-section" aria-label="Bid recommendation">
        <div className="pac-section-label">BID RECOMMENDATION</div>
        <BidDecisionCard
          valuationRow={rowForValuationUi}
          selectedPlayer={selectedPlayer}
          engineBoardPhase={engineBoardPhase}
        />
      </section>
    </>
  );
}
