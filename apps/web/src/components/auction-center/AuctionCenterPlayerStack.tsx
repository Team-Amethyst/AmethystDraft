import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import type { AuctionCenterCategoryImpactRow } from "../../pages/command-center-utils/categoryImpactRows";
import {
  commandCenterIdentityAuctionTier,
  commandCenterIdentityRanks,
} from "../../domain/auctionCenterValuation";
import type { BoardValuationUiPhase } from "../../domain/boardValuationFetchPhase";
import type { CommandCenterWalletCaps } from "../../utils/valuation";
import { AuctionCenterPlayerImpact } from "./AuctionCenterPlayerImpact";
import { BidDecisionCard } from "./BidDecisionCard";
import { PlayerIdentityCard } from "./PlayerIdentityCard";

interface AuctionCenterPlayerStackProps {
  selectedPlayer: Player;
  draftPrimaryTags: string[];
  draftableSlots?: string[];
  mergedValuationRow: ValuationResult | undefined;
  rowForValuationUi: ValuationResult | undefined;
  getNote: (id: string) => string;
  setNote: (id: string, value: string) => void;
  isInWatchlist: (id: string) => boolean;
  statView: "hitting" | "pitching";
  onStatViewChange: (v: "hitting" | "pitching") => void;
  catImpactRows: AuctionCenterCategoryImpactRow[];
  pitchingCats: { name: string; type: "batting" | "pitching" }[];
  hittingCats: { name: string; type: "batting" | "pitching" }[];
  engineBoardPhase: BoardValuationUiPhase;
  walletCaps: CommandCenterWalletCaps | null;
  auctionRankByPlayerId?: ReadonlyMap<string, number>;
  engineBoardLoaded: boolean;
  leagueBudget?: number;
}

export function AuctionCenterPlayerStack({
  selectedPlayer,
  draftPrimaryTags,
  draftableSlots = [],
  mergedValuationRow,
  rowForValuationUi,
  getNote,
  setNote,
  isInWatchlist,
  statView,
  onStatViewChange,
  catImpactRows,
  pitchingCats,
  hittingCats,
  engineBoardPhase,
  walletCaps,
  auctionRankByPlayerId,
  engineBoardLoaded,
  leagueBudget,
}: AuctionCenterPlayerStackProps) {
  const rowUi = mergedValuationRow;
  const { tierValue, tierKind } = commandCenterIdentityAuctionTier(
    selectedPlayer,
    rowUi,
    auctionRankByPlayerId,
    engineBoardLoaded,
    leagueBudget,
  );

  const { displayPlayer, marketAdp, auctionRank } = commandCenterIdentityRanks(
    selectedPlayer,
    rowUi,
    auctionRankByPlayerId,
  );

  return (
    <>
      <PlayerIdentityCard
        selectedPlayer={displayPlayer}
        draftPrimaryTags={draftPrimaryTags}
        draftableSlots={draftableSlots}
        tierValue={tierValue}
        tierKind={tierKind}
        marketAdp={marketAdp}
        auctionRank={auctionRank}
        modelRank={displayPlayer.catalog_rank}
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
          walletCaps={walletCaps}
        />
      </section>
    </>
  );
}
