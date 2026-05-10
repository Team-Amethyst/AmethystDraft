import type { Player } from "../../types/player";
import {
  MockDisclosuresFooter,
  MockDraftNotes,
  MockIdentityBlock,
  MockPerformanceSnapshot,
  MockProfileDl,
  MockValuationMetrics,
} from "./MockParts";

/** Option B — Notes-first draft prep workspace (desktop-first layout mock). */
export default function PlayerDetailMockOptionB({
  player,
  note,
  onNoteChange,
}: {
  player: Player;
  note: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div className="pdlm-frame pdlm-b">
      <header className="pdlm-b__top">
        <MockIdentityBlock player={player} headshotSize="md" />
        <button type="button" className="pdlm-close" aria-label="Close">
          ×
        </button>
      </header>
      <div className="pdlm-b__workspace">
        <aside className="pdlm-b__rail" aria-label="Valuation summary">
          <span className="pdlm-section-label">Valuation</span>
          <span className="pdlm-badge pdlm-badge--small">Likely Overpay</span>
          <MockValuationMetrics variant="rail" />
          <p className="pdlm-helper pdlm-helper--tight">
            Max bid is a strategic anchor and may exceed auction value on elite players.
          </p>
        </aside>
        <div className="pdlm-b__notes-wrap">
          <MockDraftNotes note={note} onNoteChange={onNoteChange} />
        </div>
      </div>
      <div className="pdlm-b__lower">
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
