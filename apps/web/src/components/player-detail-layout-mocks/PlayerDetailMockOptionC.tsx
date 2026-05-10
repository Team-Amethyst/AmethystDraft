import type { Player } from "../../types/player";
import {
  MockDisclosuresFooter,
  MockDraftNotes,
  MockIdentityBlock,
  MockPerformanceSnapshot,
  MockProfileDl,
  MockValuationMetrics,
} from "./MockParts";

/** Option C — Split dashboard: identity + profile rail, main workspace right (desktop-first layout mock). */
export default function PlayerDetailMockOptionC({
  player,
  note,
  onNoteChange,
}: {
  player: Player;
  note: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div className="pdlm-frame pdlm-c">
      <div className="pdlm-c__grid">
        <aside className="pdlm-c__rail">
          <div className="pdlm-c__rail-head">
            <MockIdentityBlock player={player} headshotSize="lg" />
          </div>
          <h3 className="pdlm-pane__title">Profile</h3>
          <MockProfileDl player={player} />
        </aside>
        <div className="pdlm-c__main">
          <button type="button" className="pdlm-close pdlm-close--float" aria-label="Close">
            ×
          </button>
          <section className="pdlm-c__valuation" aria-label="Valuation summary">
            <div className="pdlm-c__valuation-head">
              <span className="pdlm-section-label">Valuation</span>
              <span className="pdlm-badge">Likely Overpay</span>
            </div>
            <MockValuationMetrics variant="compact" />
            <p className="pdlm-helper">
              Max bid is a strategic anchor and may exceed auction value on elite players.
            </p>
          </section>
          <MockDraftNotes note={note} onNoteChange={onNoteChange} />
          <section className="pdlm-pane pdlm-pane--main">
            <h3 className="pdlm-pane__title">Performance Snapshot</h3>
            <MockPerformanceSnapshot player={player} />
          </section>
        </div>
      </div>
      <MockDisclosuresFooter />
    </div>
  );
}
