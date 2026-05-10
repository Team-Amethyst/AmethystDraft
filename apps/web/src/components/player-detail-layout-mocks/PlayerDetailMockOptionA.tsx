import type { Player } from "../../types/player";
import {
  MockDisclosuresFooter,
  MockDraftNotes,
  MockIdentityBlock,
  MockPerformanceSnapshot,
  MockProfileDl,
  MockValuationMetrics,
} from "./MockParts";

/** Option A — Hero + valuation-first (desktop-first layout mock). */
export default function PlayerDetailMockOptionA({
  player,
  note,
  onNoteChange,
}: {
  player: Player;
  note: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div className="pdlm-frame pdlm-a">
      <header className="pdlm-a__hero">
        <MockIdentityBlock player={player} headshotSize="lg" />
        <button type="button" className="pdlm-close" aria-label="Close">
          ×
        </button>
      </header>
      <section className="pdlm-a__valuation" aria-label="Valuation summary">
        <div className="pdlm-a__valuation-head">
          <span className="pdlm-section-label">Valuation</span>
          <span className="pdlm-badge">Likely Overpay</span>
        </div>
        <MockValuationMetrics variant="hero" />
        <p className="pdlm-helper">
          Max bid is a strategic anchor and may exceed auction value on elite players.
        </p>
      </section>
      <MockDraftNotes note={note} onNoteChange={onNoteChange} />
      <div className="pdlm-a__lower">
        <aside className="pdlm-pane pdlm-pane--quiet">
          <h3 className="pdlm-pane__title">Profile</h3>
          <MockProfileDl player={player} />
        </aside>
        <section className="pdlm-pane pdlm-pane--main">
          <h3 className="pdlm-pane__title">Performance Snapshot</h3>
          <MockPerformanceSnapshot player={player} />
        </section>
      </div>
      <MockDisclosuresFooter />
    </div>
  );
}
