import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import type { AuctionCenterCategoryImpactRow } from "../../pages/command-center-utils/categoryImpactRows";
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
}: AuctionCenterPlayerStackProps) {
  const rowUi = mergedValuationRow;
  const tierValue = rowUi?.tier ?? selectedPlayer.tier;
  const adpValue = rowUi?.adp ?? selectedPlayer.adp;
  const adpTitle =
    rowUi?.adp != null
      ? `Engine ADP (valuation row): ${rowUi.adp}`
      : "Catalog ADP";

  return (
    <>
      <PlayerIdentityCard
        selectedPlayer={selectedPlayer}
        tierValue={tierValue}
        adpValue={adpValue}
        adpTitle={adpTitle}
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
        />
      </section>
    </>
  );
}
