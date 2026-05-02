import { useEffect, useState } from "react";
import { type StatBasis, statBasisFooterDescription } from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import {
  auctionDecisionSignalFromPlayer,
  auctionTargetBidDollars,
} from "../domain/auctionBidDecision";
import {
  formatCurrencyWhole,
  formatMaybeDelta,
  playerValuationEdgeOrDiff,
} from "../utils/valuation";
import PosBadge from "./PosBadge";
import "./PlayerDetailModal.css";

interface PlayerDetailModalProps {
  isOpen: boolean;
  player: Player | null;
  /** Active research table stat lens (footer copy aligns with PlayerTable). */
  statBasis?: StatBasis;
  draftedByTeam?: string;
  draftedContract?: string;
  note?: string;
  onNoteChange?: (playerId: string, note: string) => void;
  isCustomPlayer?: boolean;
  onClose: () => void;
  onMoveToCommandCenter: (player: Player) => void;
}

function valueOrDash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default function PlayerDetailModal({
  isOpen,
  player,
  statBasis = "projections",
  draftedByTeam,
  draftedContract,
  note,
  onNoteChange,
  isCustomPlayer = false,
  onClose,
  onMoveToCommandCenter,
}: PlayerDetailModalProps) {
  if (!isOpen || !player) return null;

  const positions = player.positions?.length ? player.positions : [player.position];
  const batting = player.stats.batting;
  const pitching = player.stats.pitching;
  const projectionBat = player.projection.batting;
  const projectionPit = player.projection.pitching;
  const stats3yrBat = player.stats3yr?.batting;
  const stats3yrPit = player.stats3yr?.pitching;
  const valuationDiff = playerValuationEdgeOrDiff(player);
  const likelyBid =
    typeof player.recommended_bid === "number" && Number.isFinite(player.recommended_bid)
      ? player.recommended_bid
      : null;
  const yourValue =
    typeof player.team_adjusted_value === "number" &&
    Number.isFinite(player.team_adjusted_value)
      ? player.team_adjusted_value
      : null;
  const marketValue =
    typeof player.adjusted_value === "number" && Number.isFinite(player.adjusted_value)
      ? player.adjusted_value
      : null;
  const targetBid = auctionTargetBidDollars(player);
  const decisionSignal = auctionDecisionSignalFromPlayer(player);
  const [noteDraft, setNoteDraft] = useState(note ?? "");

  useEffect(() => {
    setNoteDraft(note ?? "");
  }, [note, player.id]);

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div
        className="pdm-modal cc-modal-shell"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} details`}
      >
        <div className="pdm-header">
          <div className="pdm-identity">
            <img className="pdm-headshot" src={player.headshot} alt={player.name} />
            <div>
              <h2 className="pdm-title">{player.name}</h2>
              <div className="pdm-meta-line">
                <span>{player.team}</span>
                <span>ADP {valueOrDash(player.adp)}</span>
                <span>Tier {valueOrDash(player.tier)}</span>
              </div>
            </div>
          </div>
          <div className="pdm-header-right">
            <div className="pdm-subtitle">
              {player.injuryStatus && <span className="pdm-chip pdm-chip--inj">{player.injuryStatus}</span>}
              {isCustomPlayer && <span className="pdm-chip">Custom</span>}
              {draftedByTeam && <span className="pdm-chip pdm-chip--drafted">Drafted by {draftedByTeam}</span>}
              {draftedContract && <span className="pdm-chip">{draftedContract}</span>}
            </div>
            <button className="pdm-close" type="button" onClick={onClose} aria-label="Close player details">
              ×
            </button>
          </div>
        </div>

        <div className="pdm-body">
        <div className="pdm-grid">
          <section className="pdm-card cc-surface-inset pdm-card--hero">
            <h3>Player profile</h3>
            <div className="pdm-positions">
              {positions.map((pos) => (
                <PosBadge key={pos} pos={pos} />
              ))}
            </div>
            <dl>
              <dt>Age</dt>
              <dd>
                {typeof player.age === "number" && Number.isFinite(player.age)
                  ? String(player.age)
                  : "—"}
              </dd>
              <dt>MLB ID</dt>
              <dd>
                {typeof player.mlbId === "number" && Number.isFinite(player.mlbId)
                  ? String(player.mlbId)
                  : "—"}
              </dd>
              <dt>Indicator</dt>
              <dd>{valueOrDash(player.indicator)}</dd>
              <dt>Drafted</dt>
              <dd>{draftedByTeam ? `Yes - ${draftedByTeam}` : "Available"}</dd>
            </dl>
          </section>

          <section className="pdm-card cc-surface-inset pdm-card--decision">
            <h3>Bid decision</h3>
            <div className="pdm-decision-signal">{decisionSignal}</div>
            <dl>
              <dt>Target Bid</dt>
              <dd>{formatCurrencyWhole(targetBid)}</dd>
              <dt>Your Value</dt>
              <dd>{formatCurrencyWhole(yourValue)}</dd>
              <dt>Market</dt>
              <dd>{formatCurrencyWhole(marketValue)}</dd>
              <dt>Value Diff</dt>
              <dd>{formatMaybeDelta(valuationDiff)}</dd>
            </dl>
            {player.outlook?.trim() ? (
              <p className="pdm-outlook">{player.outlook.trim()}</p>
            ) : null}
          </section>

          <section className="pdm-card cc-surface-inset pdm-card--wide">
            <h3>Performance Snapshot</h3>
            {batting || pitching ? (
              <div
                className={
                  batting && pitching ? "pdm-snapshot-split" : "pdm-snapshot-single"
                }
              >
                {batting ? (
                  <div className="pdm-stat-group">
                    <h4>Batting</h4>
                    <div className="pdm-compare">
                      <div className="pdm-compare-head">
                        <span className="pdm-compare-corner">Stat</span>
                        <span>Last</span>
                        <span>Proj</span>
                        <span>3Y</span>
                      </div>
                      <div className="pdm-compare-row"><span>AVG</span><span>{valueOrDash(batting.avg)}</span><span>{valueOrDash(projectionBat?.avg)}</span><span>{valueOrDash(stats3yrBat?.avg)}</span></div>
                      <div className="pdm-compare-row"><span>HR</span><span>{valueOrDash(batting.hr)}</span><span>{valueOrDash(projectionBat?.hr)}</span><span>{valueOrDash(stats3yrBat?.hr)}</span></div>
                      <div className="pdm-compare-row"><span>RBI</span><span>{valueOrDash(batting.rbi)}</span><span>{valueOrDash(projectionBat?.rbi)}</span><span>{valueOrDash(stats3yrBat?.rbi)}</span></div>
                      <div className="pdm-compare-row"><span>R</span><span>{valueOrDash(batting.runs)}</span><span>{valueOrDash(projectionBat?.runs)}</span><span>{valueOrDash(stats3yrBat?.runs)}</span></div>
                      <div className="pdm-compare-row"><span>SB</span><span>{valueOrDash(batting.sb)}</span><span>{valueOrDash(projectionBat?.sb)}</span><span>{valueOrDash(stats3yrBat?.sb)}</span></div>
                    </div>
                  </div>
                ) : null}
                {pitching ? (
                  <div className="pdm-stat-group">
                    <h4>Pitching</h4>
                    <div className="pdm-compare">
                      <div className="pdm-compare-head">
                        <span className="pdm-compare-corner">Stat</span>
                        <span>Last</span>
                        <span>Proj</span>
                        <span>3Y</span>
                      </div>
                      <div className="pdm-compare-row"><span>ERA</span><span>{valueOrDash(pitching.era)}</span><span>{valueOrDash(projectionPit?.era)}</span><span>{valueOrDash(stats3yrPit?.era)}</span></div>
                      <div className="pdm-compare-row"><span>WHIP</span><span>{valueOrDash(pitching.whip)}</span><span>{valueOrDash(projectionPit?.whip)}</span><span>{valueOrDash(stats3yrPit?.whip)}</span></div>
                      <div className="pdm-compare-row"><span>W</span><span>{valueOrDash(pitching.wins)}</span><span>{valueOrDash(projectionPit?.wins)}</span><span>{valueOrDash(stats3yrPit?.wins)}</span></div>
                      <div className="pdm-compare-row"><span>SV</span><span>{valueOrDash(pitching.saves)}</span><span>{valueOrDash(projectionPit?.saves)}</span><span>{valueOrDash(stats3yrPit?.saves)}</span></div>
                      <div className="pdm-compare-row"><span>K</span><span>{valueOrDash(pitching.strikeouts)}</span><span>{valueOrDash(projectionPit?.strikeouts)}</span><span>{valueOrDash(stats3yrPit?.strikeouts)}</span></div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="pdm-empty">No stat lines available for this player.</p>
            )}
          </section>

          <section className="pdm-card cc-surface-inset pdm-card--wide">
            <h3>Your Player Notes</h3>
            <p className="pdm-note-help">Notes save automatically as you type.</p>
            <textarea
              className="pdm-note-editor"
              value={noteDraft}
              placeholder="Capture target bid, fallback options, roster fit, and risk notes..."
              onChange={(event) => {
                const next = event.target.value;
                setNoteDraft(next);
                onNoteChange?.(player.id, next);
              }}
            />
          </section>

          {(player.why?.length || player.market_notes?.length) && (
            <section className="pdm-card cc-surface-inset pdm-card--wide pdm-card--details">
              <details className="pdm-model-details">
                <summary className="pdm-model-summary">Model notes</summary>
                {player.why?.length ? (
                  <div className="pdm-note-block">
                    <h4>Why</h4>
                    <ul>
                      {player.why.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {player.market_notes?.length ? (
                  <div className="pdm-note-block">
                    <h4>Market Notes</h4>
                    <ul>
                      {player.market_notes.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </details>
            </section>
          )}
        </div>
        </div>

        <p className="pdm-basis-foot">{statBasisFooterDescription(statBasis)}</p>

        <div className="pdm-actions">
          <button type="button" className="pdm-btn pdm-btn--secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="pdm-btn pdm-btn--primary" onClick={() => onMoveToCommandCenter(player)}>
            Draft in Command Center
          </button>
        </div>
      </div>
    </div>
  );
}
