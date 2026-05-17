import { useEffect } from "react";
import type { OverviewTeamData } from "./command-center-utils/overviewRoster";

/** Compact counts for team card footer (e.g. "Minors 8 · Taxi 8"). */
export function formatReserveCountLine(
  minorCount: number,
  taxiCount: number,
): string {
  const parts: string[] = [];
  if (minorCount > 0) parts.push(`Minors ${minorCount}`);
  if (taxiCount > 0) parts.push(`Taxi ${taxiCount}`);
  return parts.join(" · ");
}

/** Modal subtitle (e.g. "Reserves: 6 minors · 8 taxi"). */
export function formatReserveModalSubtitle(
  minorCount: number,
  taxiCount: number,
): string {
  const parts: string[] = [];
  if (minorCount > 0) {
    parts.push(`${minorCount} minor${minorCount === 1 ? "" : "s"}`);
  }
  if (taxiCount > 0) {
    parts.push(`${taxiCount} taxi`);
  }
  if (parts.length === 0) return "Reserves";
  return `Reserves: ${parts.join(" · ")}`;
}

function ReserveModalRow({
  name,
  teamAbbrev,
}: {
  name: string;
  teamAbbrev: string | null;
}) {
  return (
    <li className="lo-reserves-modal-row">
      <span className="lo-reserves-modal-name">{name}</span>
      {teamAbbrev ? (
        <span className="lo-reserves-modal-team">{teamAbbrev}</span>
      ) : null}
    </li>
  );
}

export function ReserveFooter({
  data,
  onViewReserves,
}: {
  data: OverviewTeamData;
  onViewReserves: () => void;
}) {
  const minorCount = data.minors.length;
  const taxiCount = data.taxi.length;
  if (minorCount === 0 && taxiCount === 0) return null;

  return (
    <div className="lo-reserve-footer">
      <span className="lo-reserve-footer-counts">
        {formatReserveCountLine(minorCount, taxiCount)}
      </span>
      <button
        type="button"
        className="lo-reserve-btn"
        onClick={onViewReserves}
        aria-haspopup="dialog"
      >
        View reserves
      </button>
    </div>
  );
}

export function TeamReservesModal({
  team,
  onClose,
}: {
  team: OverviewTeamData;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const minorCount = team.minors.length;
  const taxiCount = team.taxi.length;

  return (
    <div
      className="lo-reserves-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="lo-reserves-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${team.teamName} reserves`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lo-reserves-modal-header">
          <div className="lo-reserves-modal-heading">
            <span className="lo-reserves-modal-title">{team.teamName}</span>
            <span className="lo-reserves-modal-meta">
              {formatReserveModalSubtitle(minorCount, taxiCount)}
            </span>
          </div>
          <button
            type="button"
            className="lo-reserves-modal-close"
            onClick={onClose}
            aria-label="Close reserves"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        <div className="lo-reserves-modal-body">
          <div className="lo-reserves-modal-columns">
            {minorCount > 0 ? (
              <section className="lo-reserves-modal-section">
                <h3 className="lo-reserves-modal-section-title">
                  Minors ({minorCount})
                </h3>
                <ul className="lo-reserves-modal-list">
                  {team.minors.map((row) => (
                    <ReserveModalRow
                      key={`min-${row.playerName}-${row.rosterSlot}`}
                      name={row.playerName}
                      teamAbbrev={row.playerTeam}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {taxiCount > 0 ? (
              <section className="lo-reserves-modal-section">
                <h3 className="lo-reserves-modal-section-title">
                  Taxi ({taxiCount})
                </h3>
                <ul className="lo-reserves-modal-list">
                  {team.taxi.map((row) => (
                    <ReserveModalRow
                      key={`taxi-${row.playerName}-${row.rosterSlot}`}
                      name={row.playerName}
                      teamAbbrev={row.playerTeam}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
