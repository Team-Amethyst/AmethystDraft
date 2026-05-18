import { Fragment, type ReactNode } from "react";
import PosBadge from "../PosBadge";
import CustomPlayerHeadshot from "../CustomPlayerHeadshot";
import type { Player } from "../../types/player";
import type { CommandCenterTierKind } from "../../domain/auctionCenterValuation";
import { USER_FACING_TIER_TOOLTIP } from "../../domain/displayTiers";
import {
  AUCTION_RANK_TOOLTIP,
  marketAdpDetailTooltip,
  MODEL_RANK_TOOLTIP,
} from "../../domain/rankTierLabels";

const TIER_BADGE_COLORS = [
  "#a855f7",
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#6b7280",
] as const;

function MetaDot() {
  return (
    <span className="pac-meta-dot" aria-hidden>
      ·
    </span>
  );
}

export function PlayerIdentityCard({
  selectedPlayer,
  draftPrimaryTags,
  draftableSlots = [],
  tierValue,
  tierKind = "auction",
  marketAdp,
  auctionRank,
  modelRank,
  isInWatchlist,
  playerNote,
  setPlayerNote,
}: {
  selectedPlayer: Player;
  draftPrimaryTags: string[];
  draftableSlots?: string[];
  tierValue?: number;
  tierKind?: CommandCenterTierKind;
  marketAdp?: number | null;
  auctionRank?: number | null;
  modelRank: number;
  isInWatchlist: (id: string) => boolean;
  playerNote: string;
  setPlayerNote: (value: string) => void;
}) {
  const primaryPos = draftPrimaryTags[0] ?? null;
  const injuryLabel = selectedPlayer.injuryStatus
    ? selectedPlayer.injuryStatus.replace("DL", "IL")
    : null;
  const showTier =
    tierValue != null && Number.isFinite(tierValue) && tierValue > 0;
  const tierTitle = USER_FACING_TIER_TOOLTIP;
  const showMarketAdp =
    marketAdp != null && Number.isFinite(marketAdp);
  const showAuctionRank =
    auctionRank != null && Number.isFinite(auctionRank);
  const showModelRank = Number.isFinite(modelRank);
  const hasSlots = draftableSlots.length > 0;

  const marketAdpTitle = marketAdpDetailTooltip({
    market_adp_source: selectedPlayer.market_adp_source,
    market_adp_updated_at: selectedPlayer.market_adp_updated_at,
    market_adp_min: selectedPlayer.market_adp_min,
    market_adp_max: selectedPlayer.market_adp_max,
    market_pick_count: selectedPlayer.market_pick_count,
  });

  const rankSegments: { key: string; node: ReactNode }[] = [];
  if (showMarketAdp) {
    rankSegments.push({
      key: "adp",
      node: (
        <span className="pic-meta-stat" title={marketAdpTitle}>
          Market ADP {marketAdp}
        </span>
      ),
    });
  }
  if (showAuctionRank) {
    rankSegments.push({
      key: "auction",
      node: (
        <span className="pic-meta-stat" title={AUCTION_RANK_TOOLTIP}>
          Auction {auctionRank}
        </span>
      ),
    });
  }
  if (showModelRank) {
    rankSegments.push({
      key: "model",
      node: (
        <span className="pic-meta-stat" title={MODEL_RANK_TOOLTIP}>
          Model {modelRank}
        </span>
      ),
    });
  }
  if (showTier) {
    rankSegments.push({
      key: "tier",
      node: (
        <span
          className="pic-meta-stat pic-meta-stat--tier"
          style={{
            background:
              TIER_BADGE_COLORS[tierValue - 1] ?? TIER_BADGE_COLORS[4],
          }}
          title={tierTitle}
        >
          T{tierValue}
        </span>
      ),
    });
  }
  return (
    <div className="player-identity-card command-center-header">
      <div className="pic-layout">
        <div className="pic-player-col">
          <div className="pic-row">
            {selectedPlayer.id.startsWith("custom_") ||
            !selectedPlayer.headshot ? (
              <CustomPlayerHeadshot
                size={64}
                className="pac-headshot pac-headshot--identity"
              />
            ) : (
              <img
                src={selectedPlayer.headshot}
                alt=""
                className="pac-headshot pac-headshot--identity"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="pic-identity-text">
              <div className="pic-name-row">
                <h1 className="pac-name pac-name--identity">
                  <span className="pic-name-text">{selectedPlayer.name}</span>
                  {injuryLabel ? (
                    <span
                      className="pt-il-badge pic-name-injury-icon"
                      title={`Injury: ${injuryLabel}`}
                    >
                      {injuryLabel}
                    </span>
                  ) : null}
                  {isInWatchlist(selectedPlayer.id) ? (
                    <span className="pac-wl-badge" title="On your watchlist">
                      ★
                    </span>
                  ) : null}
                </h1>
                {selectedPlayer.team ? (
                  <span
                    className="pic-name-team"
                    title={selectedPlayer.team}
                  >
                    {selectedPlayer.team}
                  </span>
                ) : null}
                {primaryPos ? (
                  <span className="pic-name-pos-group">
                    <PosBadge
                      pos={primaryPos}
                      className="pic-primary-pos-badge"
                    />
                  </span>
                ) : null}
              </div>

              {rankSegments.length > 0 ? (
                <div className="pac-meta-inline pic-ranks-row">
                  {rankSegments.map((segment, index) => (
                    <Fragment key={segment.key}>
                      {index > 0 ? <MetaDot /> : null}
                      {segment.node}
                    </Fragment>
                  ))}
                </div>
              ) : null}

              {hasSlots ? (
                <div
                  className="pic-slots-row"
                  title="Roster slots you can draft this player into"
                >
                  <span className="pic-slots-label">Slots:</span>
                  {draftableSlots.map((slot) => (
                    <PosBadge
                      key={slot}
                      pos={slot}
                      className="pic-slot-elig-badge"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="pic-notes-col">
          <label className="pac-notes-col-label" htmlFor="pac-note-player">
            PLAYER NOTES
          </label>
          <textarea
            id="pac-note-player"
            className="pac-notes pac-notes--identity"
            value={playerNote}
            onChange={(e) => setPlayerNote(e.target.value)}
            placeholder="Scouting notes, injury watch, platoon risk…"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
