import type { DepthChartPlayerRow } from "../../api/players";
import "./DepthChartUnmatchedModal.css";

interface DepthChartUnmatchedModalProps {
  isOpen: boolean;
  row: DepthChartPlayerRow | null;
  chartPosition: string;
  teamAbbr: string;
  onClose: () => void;
}

export function DepthChartUnmatchedModal({
  isOpen,
  row,
  chartPosition,
  teamAbbr,
  onClose,
}: DepthChartUnmatchedModalProps) {
  if (!isOpen || !row) return null;

  return (
    <ModalBackdrop onClick={onClose}>
      <ModalClickShield>
        <div
          className="depth-unmatched-modal cc-modal-shell"
          role="dialog"
          aria-labelledby="depth-unmatched-title"
          aria-modal="true"
        >
          <header className="depth-unmatched-modal__header">
            <h2 id="depth-unmatched-title">{row.playerName}</h2>
            <button
              type="button"
              className="depth-unmatched-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <div className="depth-unmatched-modal__body">
            <p className="depth-unmatched-modal__lead">Depth chart record only</p>
            <p className="depth-unmatched-modal__detail">
              No app player record matched yet.
            </p>
            <dl className="depth-unmatched-modal__meta">
              <dt>MLB team</dt>
              <dd>{teamAbbr}</dd>
              <dt>Depth slot</dt>
              <dd>
                {chartPosition} · #{row.rank}
              </dd>
              {row.primaryPosition ? (
                <>
                  <dt>Position</dt>
                  <dd>{row.primaryPosition}</dd>
                </>
              ) : null}
              {row.playerId > 0 ? (
                <>
                  <dt>MLB ID</dt>
                  <dd>{row.playerId}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </ModalClickShield>
    </ModalBackdrop>
  );
}

function ModalClickShield({ children }: { children: React.ReactNode }) {
  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

function ModalBackdrop({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="depth-unmatched-modal__backdrop" onClick={onClick}>
      {children}
    </div>
  );
}
