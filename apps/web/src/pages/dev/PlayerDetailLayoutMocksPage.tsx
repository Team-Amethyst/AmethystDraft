import { useState } from "react";
import PlayerDetailMockOptionA from "../../components/player-detail-layout-mocks/PlayerDetailMockOptionA";
import PlayerDetailMockOptionB from "../../components/player-detail-layout-mocks/PlayerDetailMockOptionB";
import PlayerDetailMockOptionC from "../../components/player-detail-layout-mocks/PlayerDetailMockOptionC";
import { MOCK_PLAYER_FOR_LAYOUTS } from "../../components/player-detail-layout-mocks/mockPlayer";
import "../../components/player-detail-layout-mocks/PlayerDetailLayoutMocks.css";

/**
 * Dev-only: compare three Player Detail layout directions using static data.
 * Route: `/dev/player-detail-layout-mocks` (registered only when `import.meta.env.DEV`).
 */
export default function PlayerDetailLayoutMocksPage() {
  const [note, setNote] = useState(
    "Target $48 if room is thin on power; pivot to Soto tier if price runs past $52.",
  );

  return (
    <div className="pdlm-page">
      <header className="pdlm-page__intro">
        <h1>Player detail — layout directions (dev preview)</h1>
        <p>
          Three non-production mocks using the same static player payload. These are for visual
          comparison only; the live modal is unchanged. Open each section in a wide viewport for
          the intended desktop hierarchy.
        </p>
      </header>

      <section className="pdlm-page__block" id="player-detail-mock-option-a">
        <h2>Option A — Hero + valuation-first</h2>
        <PlayerDetailMockOptionA player={MOCK_PLAYER_FOR_LAYOUTS} note={note} onNoteChange={setNote} />
      </section>

      <section className="pdlm-page__block" id="player-detail-mock-option-b">
        <h2>Option B — Notes-first draft prep workspace</h2>
        <PlayerDetailMockOptionB player={MOCK_PLAYER_FOR_LAYOUTS} note={note} onNoteChange={setNote} />
      </section>

      <section className="pdlm-page__block" id="player-detail-mock-option-c">
        <h2>Option C — Split dashboard</h2>
        <PlayerDetailMockOptionC player={MOCK_PLAYER_FOR_LAYOUTS} note={note} onNoteChange={setNote} />
      </section>
    </div>
  );
}
