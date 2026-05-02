import PosBadge from "../PosBadge";
import CustomPlayerHeadshot from "../CustomPlayerHeadshot";
import type { Player } from "../../types/player";

export function PlayerIdentityCard({
  selectedPlayer,
  tierValue,
  adpValue,
  adpTitle,
  valueVsBidBadge,
  isInWatchlist,
  playerNote,
  setPlayerNote,
}: {
  selectedPlayer: Player;
  tierValue: number;
  adpValue: number;
  adpTitle: string;
  valueVsBidBadge: {
    deltaText: string;
    label: string;
    tone: "pos" | "neg" | "muted";
  } | null;
  isInWatchlist: (id: string) => boolean;
  playerNote: string;
  setPlayerNote: (value: string) => void;
}) {
  return (
    <div className="player-identity-card command-center-header">
      <div className="pic-layout">
        <div className="pic-player-col">
          <div className="pic-row">
            {selectedPlayer.id.startsWith("custom_") ||
            !selectedPlayer.headshot ? (
              <CustomPlayerHeadshot
                size={52}
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
              <h1 className="pac-name pac-name--identity">
                {selectedPlayer.name}
                {selectedPlayer.injuryStatus && (
                  <span className="pt-il-badge">
                    {selectedPlayer.injuryStatus.replace("DL", "IL")}
                  </span>
                )}
                {isInWatchlist(selectedPlayer.id) && (
                  <span className="pac-wl-badge" title="On your watchlist">
                    ★
                  </span>
                )}
              </h1>
              <div className="pac-meta-inline">
                <span className="pac-meta-inline-badges">
                  {(selectedPlayer.positions?.length
                    ? selectedPlayer.positions
                    : [selectedPlayer.position]
                  ).map((pos) => (
                    <PosBadge key={pos} pos={pos} />
                  ))}
                </span>
                <span className="pac-meta-dot" aria-hidden>
                  ·
                </span>
                <span className="pac-meta-inline-team" title={selectedPlayer.team}>
                  {selectedPlayer.team}
                </span>
                <span className="pac-meta-dot" aria-hidden>
                  ·
                </span>
                <span
                  className="pac-tier-badge pac-tier-badge--inline"
                  style={{
                    background:
                      [
                        "#a855f7",
                        "#6366f1",
                        "#22c55e",
                        "#f59e0b",
                        "#6b7280",
                      ][tierValue - 1] ?? "#6b7280",
                  }}
                >
                  T{tierValue}
                </span>
                <span className="pac-meta-dot" aria-hidden>
                  ·
                </span>
                <span className="pac-meta-inline-adp" title={adpTitle}>
                  ADP {adpValue}
                </span>
                {valueVsBidBadge ? (
                  <>
                    <span className="pac-meta-dot" aria-hidden>
                      ·
                    </span>
                    <span
                      className={
                        "pic-vb-badge pic-vb-badge--inline pic-vb-badge--" +
                        valueVsBidBadge.tone
                      }
                      title="Your Value minus recommended bid (rounded), after finite cleanup"
                    >
                      <span className="pic-vb-badge-delta">
                        {valueVsBidBadge.deltaText}
                      </span>
                      <span className="pic-vb-badge-label">
                        {valueVsBidBadge.label}
                      </span>
                    </span>
                  </>
                ) : null}
              </div>
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
