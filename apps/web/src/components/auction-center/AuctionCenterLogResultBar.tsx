import type { Player } from "../../types/player";
import { RosterSlotPicker } from "../RosterSlotPicker";

interface AuctionCenterLogResultBarProps {
  teamNames: string[];
  wonBy: string;
  onWonByChange: (teamName: string) => void;
  finalPrice: string;
  onFinalPriceChange: (value: string) => void;
  draftedToSlot: string;
  onDraftedToSlotChange: (slot: string) => void;
  overrideSlotOptions: string[];
  eligibleSlotOptions: string[];
  selectedPlayer: Player | null;
  submitting: boolean;
  hasBidSignal: boolean;
  onLog: () => void;
}

export function AuctionCenterLogResultBar({
  teamNames,
  wonBy,
  onWonByChange,
  finalPrice,
  onFinalPriceChange,
  draftedToSlot,
  onDraftedToSlotChange,
  overrideSlotOptions,
  eligibleSlotOptions,
  selectedPlayer,
  submitting,
  hasBidSignal,
  onLog,
}: AuctionCenterLogResultBarProps) {
  return (
    <div className="pac-log-action-bar" role="group" aria-label="Log result">
      <div className="pac-log-action-label">LOG RESULT</div>
      <div className="log-result-grid log-result-grid--inline command-center-log-row">
        <div className="log-field">
          <select
            className="log-select"
            value={wonBy}
            onChange={(e) => onWonByChange(e.target.value)}
          >
            {teamNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="log-field">
          <div className="log-price-input-wrap">
            <span className="log-dollar">$</span>
            <input
              type="text"
              className="log-price-input"
              value={finalPrice}
              onChange={(e) => onFinalPriceChange(e.target.value)}
              title="Bid amount; defaults to suggested bid when available"
            />
          </div>
        </div>
        <div className="log-field">
          <RosterSlotPicker
            variant="command-center"
            value={draftedToSlot}
            onChange={onDraftedToSlotChange}
            orderedSlots={overrideSlotOptions}
            eligibleSlots={eligibleSlotOptions}
            disabled={!selectedPlayer}
            warn={overrideSlotOptions.length === 0}
            emptyLabel="— no open slots —"
          />
        </div>
        <button
          className="log-result-btn log-result-btn--inline"
          type="button"
          onClick={() => void onLog()}
          disabled={
            submitting ||
            !wonBy ||
            !finalPrice ||
            overrideSlotOptions.length === 0 ||
            !hasBidSignal
          }
        >
          {submitting ? "Logging…" : "Log"}
        </button>
      </div>
    </div>
  );
}
