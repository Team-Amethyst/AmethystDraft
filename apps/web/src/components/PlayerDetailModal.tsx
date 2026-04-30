import type { Player } from "../types/player";
import { formatCurrencyWhole, formatMaybeDelta } from "../utils/valuation";
import PosBadge from "./PosBadge";
import "./PlayerDetailModal.css";

interface PlayerDetailModalProps {
  isOpen: boolean;
  player: Player | null;
  draftedByTeam?: string;
  draftedContract?: string;
  note?: string;
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
  draftedByTeam,
  draftedContract,
  note,
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

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div
        className="pdm-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} details`}
      >
        <div className="pdm-header">
          <div>
            <h2 className="pdm-title">{player.name}</h2>
            <div className="pdm-subtitle">
              <span>{player.team}</span>
              <span>ADP {valueOrDash(player.adp)}</span>
              <span>Tier {valueOrDash(player.tier)}</span>
              {player.injuryStatus && <span className="pdm-chip pdm-chip--inj">{player.injuryStatus}</span>}
              {isCustomPlayer && <span className="pdm-chip">Custom</span>}
              {draftedByTeam && <span className="pdm-chip pdm-chip--drafted">Drafted by {draftedByTeam}</span>}
              {draftedContract && <span className="pdm-chip">{draftedContract}</span>}
            </div>
          </div>
          <button className="pdm-close" type="button" onClick={onClose} aria-label="Close player details">
            x
          </button>
        </div>

        <div className="pdm-grid">
          <section className="pdm-card">
            <h3>Profile</h3>
            <div className="pdm-positions">
              {positions.map((pos) => (
                <PosBadge key={pos} pos={pos} />
              ))}
            </div>
            <dl>
              <dt>Age</dt>
              <dd>{valueOrDash(player.age || "-")}</dd>
              <dt>MLB ID</dt>
              <dd>{valueOrDash(player.mlbId || "-")}</dd>
              <dt>Indicator</dt>
              <dd>{valueOrDash(player.indicator)}</dd>
            </dl>
          </section>

          <section className="pdm-card">
            <h3>Valuation</h3>
            <dl>
              <dt>Likely Bid</dt>
              <dd>{formatCurrencyWhole(player.recommended_bid)}</dd>
              <dt>Your Value</dt>
              <dd>{formatCurrencyWhole(player.team_adjusted_value)}</dd>
              <dt>Market Value</dt>
              <dd>{formatCurrencyWhole(player.adjusted_value)}</dd>
              <dt>Player Strength</dt>
              <dd>{formatCurrencyWhole(player.baseline_value)}</dd>
              <dt>Val Diff</dt>
              <dd>{formatMaybeDelta(player.edge)}</dd>
            </dl>
          </section>

          <section className="pdm-card">
            <h3>Stats</h3>
            {batting ? (
              <div className="pdm-stat-group">
                <h4>Batting</h4>
                <p>AVG {batting.avg} | HR {batting.hr} | RBI {batting.rbi} | R {batting.runs} | SB {batting.sb}</p>
                <p>OBP {batting.obp} | SLG {batting.slg}</p>
              </div>
            ) : (
              <p className="pdm-empty">No batting stats available.</p>
            )}
            {pitching ? (
              <div className="pdm-stat-group">
                <h4>Pitching</h4>
                <p>ERA {pitching.era} | WHIP {pitching.whip} | W {pitching.wins} | SV {pitching.saves}</p>
                <p>K {pitching.strikeouts} | HLD {pitching.holds} | CG {pitching.completeGames} | IP {pitching.innings}</p>
              </div>
            ) : (
              <p className="pdm-empty">No pitching stats available.</p>
            )}
          </section>

          <section className="pdm-card">
            <h3>Projections</h3>
            {projectionBat ? (
              <p>Batting: AVG {projectionBat.avg} | HR {projectionBat.hr} | RBI {projectionBat.rbi} | R {projectionBat.runs} | SB {projectionBat.sb}</p>
            ) : (
              <p className="pdm-empty">No batting projection available.</p>
            )}
            {projectionPit ? (
              <p>Pitching: ERA {projectionPit.era} | WHIP {projectionPit.whip} | W {projectionPit.wins} | SV {projectionPit.saves} | K {projectionPit.strikeouts} | HLD {projectionPit.holds} | CG {projectionPit.completeGames} | IP {valueOrDash(projectionPit.innings)}</p>
            ) : (
              <p className="pdm-empty">No pitching projection available.</p>
            )}
          </section>

          {(player.why?.length || player.market_notes?.length || note) && (
            <section className="pdm-card pdm-card--wide">
              <h3>Notes</h3>
              {note && (
                <div className="pdm-note-block">
                  <h4>Your Note</h4>
                  <p>{note}</p>
                </div>
              )}
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
            </section>
          )}
        </div>

        <div className="pdm-actions">
          <button type="button" className="pdm-btn pdm-btn--secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="pdm-btn pdm-btn--primary" onClick={() => onMoveToCommandCenter(player)}>
            Move to Command Center
          </button>
        </div>
      </div>
    </div>
  );
}
