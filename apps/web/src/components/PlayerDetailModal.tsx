import {
  useEffect,
  useState,
  type StatBasis,
  statBasisFooterDescription,
} from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import { formatCurrencyWhole, formatMaybeDelta } from "../utils/valuation";
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
  const valuationDiff = player.edge ?? player.team_adjusted_value ?? null;
  const [noteDraft, setNoteDraft] = useState(note ?? "");

  useEffect(() => {
    setNoteDraft(note ?? "");
  }, [note, player.id]);

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

        <div className="pdm-grid">
          <section className="pdm-card pdm-card--hero">
            <h3>Player profile</h3>
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
              <dt>Outlook</dt>
              <dd>{valueOrDash(player.outlook)}</dd>
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
              <dd>{formatMaybeDelta(valuationDiff)}</dd>
            </dl>
          </section>

          <section className="pdm-card">
            <h3>Last completed season (API)</h3>
            {batting ? (
              <div className="pdm-stat-group">
                <h4>Batting</h4>
                <dl className="pdm-mini-grid">
                  <dt>AVG</dt><dd>{valueOrDash(batting.avg)}</dd>
                  <dt>HR</dt><dd>{valueOrDash(batting.hr)}</dd>
                  <dt>RBI</dt><dd>{valueOrDash(batting.rbi)}</dd>
                  <dt>R</dt><dd>{valueOrDash(batting.runs)}</dd>
                  <dt>SB</dt><dd>{valueOrDash(batting.sb)}</dd>
                  <dt>OBP</dt><dd>{valueOrDash(batting.obp)}</dd>
                  <dt>SLG</dt><dd>{valueOrDash(batting.slg)}</dd>
                </dl>
              </div>
            ) : (
              <p className="pdm-empty">No batting stats available.</p>
            )}
            {pitching ? (
              <div className="pdm-stat-group">
                <h4>Pitching</h4>
                <dl className="pdm-mini-grid">
                  <dt>ERA</dt><dd>{valueOrDash(pitching.era)}</dd>
                  <dt>WHIP</dt><dd>{valueOrDash(pitching.whip)}</dd>
                  <dt>W</dt><dd>{valueOrDash(pitching.wins)}</dd>
                  <dt>SV</dt><dd>{valueOrDash(pitching.saves)}</dd>
                  <dt>K</dt><dd>{valueOrDash(pitching.strikeouts)}</dd>
                  <dt>HLD</dt><dd>{valueOrDash(pitching.holds)}</dd>
                  <dt>CG</dt><dd>{valueOrDash(pitching.completeGames)}</dd>
                  <dt>IP</dt><dd>{valueOrDash(pitching.innings)}</dd>
                </dl>
              </div>
            ) : (
              <p className="pdm-empty">No pitching stats available.</p>
            )}
          </section>

          <section className="pdm-card">
            <h3>Blended outlook (5/3/2 year weights)</h3>
            {projectionBat ? (
              <div className="pdm-stat-group">
                <h4>Batting</h4>
                <dl className="pdm-mini-grid">
                  <dt>AVG</dt><dd>{valueOrDash(projectionBat.avg)}</dd>
                  <dt>HR</dt><dd>{valueOrDash(projectionBat.hr)}</dd>
                  <dt>RBI</dt><dd>{valueOrDash(projectionBat.rbi)}</dd>
                  <dt>R</dt><dd>{valueOrDash(projectionBat.runs)}</dd>
                  <dt>SB</dt><dd>{valueOrDash(projectionBat.sb)}</dd>
                </dl>
              </div>
            ) : (
              <p className="pdm-empty">No batting projection available.</p>
            )}
            {projectionPit ? (
              <div className="pdm-stat-group">
                <h4>Pitching</h4>
                <dl className="pdm-mini-grid">
                  <dt>ERA</dt><dd>{valueOrDash(projectionPit.era)}</dd>
                  <dt>WHIP</dt><dd>{valueOrDash(projectionPit.whip)}</dd>
                  <dt>W</dt><dd>{valueOrDash(projectionPit.wins)}</dd>
                  <dt>SV</dt><dd>{valueOrDash(projectionPit.saves)}</dd>
                  <dt>K</dt><dd>{valueOrDash(projectionPit.strikeouts)}</dd>
                  <dt>HLD</dt><dd>{valueOrDash(projectionPit.holds)}</dd>
                  <dt>CG</dt><dd>{valueOrDash(projectionPit.completeGames)}</dd>
                  <dt>IP</dt><dd>{valueOrDash(projectionPit.innings)}</dd>
                </dl>
              </div>
            ) : (
              <p className="pdm-empty">No pitching projection available.</p>
            )}
          </section>

          {(stats3yrBat || stats3yrPit) && (
            <section className="pdm-card">
              <h3>3-year blend</h3>
              {stats3yrBat ? (
                <div className="pdm-stat-group">
                  <h4>Batting</h4>
                  <dl className="pdm-mini-grid">
                    <dt>AVG</dt><dd>{valueOrDash(stats3yrBat.avg)}</dd>
                    <dt>HR</dt><dd>{valueOrDash(stats3yrBat.hr)}</dd>
                    <dt>RBI</dt><dd>{valueOrDash(stats3yrBat.rbi)}</dd>
                    <dt>R</dt><dd>{valueOrDash(stats3yrBat.runs)}</dd>
                    <dt>SB</dt><dd>{valueOrDash(stats3yrBat.sb)}</dd>
                    <dt>OBP</dt><dd>{valueOrDash(stats3yrBat.obp)}</dd>
                    <dt>SLG</dt><dd>{valueOrDash(stats3yrBat.slg)}</dd>
                  </dl>
                </div>
              ) : null}
              {stats3yrPit ? (
                <div className="pdm-stat-group">
                  <h4>Pitching</h4>
                  <dl className="pdm-mini-grid">
                    <dt>ERA</dt><dd>{valueOrDash(stats3yrPit.era)}</dd>
                    <dt>WHIP</dt><dd>{valueOrDash(stats3yrPit.whip)}</dd>
                    <dt>W</dt><dd>{valueOrDash(stats3yrPit.wins)}</dd>
                    <dt>SV</dt><dd>{valueOrDash(stats3yrPit.saves)}</dd>
                    <dt>K</dt><dd>{valueOrDash(stats3yrPit.strikeouts)}</dd>
                    <dt>IP</dt><dd>{valueOrDash(stats3yrPit.innings)}</dd>
                  </dl>
                </div>
              ) : null}
            </section>
          )}

          <section className="pdm-card pdm-card--wide">
            <h3>Personal Notes</h3>
            <textarea
              className="pdm-note-editor"
              value={noteDraft}
              placeholder="Add draft thoughts, keeper logic, risk notes, and target price reminders..."
              onChange={(event) => {
                const next = event.target.value;
                setNoteDraft(next);
                onNoteChange?.(player.id, next);
              }}
            />
          </section>

          {(player.why?.length || player.market_notes?.length) && (
            <section className="pdm-card pdm-card--wide">
              <h3>Model Notes</h3>
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

        <p className="pdm-basis-foot">{statBasisFooterDescription(statBasis)}</p>

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
