import { useEffect, useMemo, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import { DraftLogRow } from "../DraftLogRow";

export function CommandCenterDraftLog({
  rosterEntries,
  league,
  allPlayers,
  myTeamId,
  onRemovePick,
  onUpdatePick,
}: {
  rosterEntries: RosterEntry[];
  league: League | null;
  allPlayers: Player[];
  myTeamId: string | null;
  onRemovePick?: (id: string) => void;
  onUpdatePick?: (
    id: string,
    data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    },
  ) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers],
  );
  const slotOptions = useMemo(
    () => (league?.rosterSlots ? Object.keys(league.rosterSlots) : []),
    [league],
  );
  const teamOptions = useMemo(
    () =>
      (league?.teamNames ?? []).map((name, i) => ({
        id: `team_${i + 1}`,
        name,
      })),
    [league],
  );
  const sorted = useMemo(
    () =>
      [...rosterEntries]
        .filter((e) => !e.isKeeper)
        .sort(
          (a, b) =>
            new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
            new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
        ),
    [rosterEntries],
  );

  useEffect(() => {
    if (!isModalOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isModalOpen]);

  const draftCountLabel =
    sorted.length === 1 ? "1 pick made" : `${sorted.length} picks made`;

  return (
    <>
      <div className="market-section-label market-section-label--spaced">
        DRAFT LOG
        <span className="cc-draft-log-count">{draftCountLabel}</span>
      </div>
      <div className="cc-draft-log-summary">
        <div className="cc-draft-log-summary-copy">
          <div className="cc-draft-log-summary-title">Draft Log</div>
          <div className="cc-draft-log-summary-description">
            {sorted.length > 0
              ? draftCountLabel
              : "No picks yet. Open the draft log to watch picks as they happen."}
          </div>
        </div>
        <button
          type="button"
          className="cc-draft-log-button"
          onClick={() => setIsModalOpen(true)}
        >
          View Draft Log
        </button>
      </div>
      {isModalOpen && (
        <div
          className="cc-draft-log-modal-overlay"
          role="presentation"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="cc-draft-log-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Draft Log"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cc-draft-log-modal-header">
              <div>
                <div className="cc-draft-log-modal-title">Draft Log</div>
                <div className="cc-draft-log-modal-subtitle">
                  {draftCountLabel}
                </div>
              </div>
              <button
                type="button"
                className="cc-draft-log-modal-close"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close draft log"
              >
                ×
              </button>
            </div>

            <div className="cc-draft-log-modal-body">
              {sorted.length === 0 ? (
                <div className="cc-draft-log-modal-empty">
                  No picks yet. The draft log will show every selected player here
                  as soon as the auction begins.
                </div>
              ) : (
                <div className="cc-draft-log-modal-list">
                  {sorted.map((entry, i) => {
                    const teamIdx = entry.teamId
                      ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
                      : (league?.memberIds.indexOf(entry.userId) ?? -1);
                    const teamName =
                      teamIdx >= 0
                        ? (league?.teamNames[teamIdx] ?? entry.teamId ?? entry.userId)
                        : (entry.teamId ?? entry.userId);
                    const player = playerMap.get(entry.externalPlayerId);
                    const myIdx =
                      myTeamId != null
                        ? parseInt(myTeamId.replace("team_", ""), 10) - 1
                        : -1;
                    const isMyTeamPick =
                      myTeamId != null &&
                      (entry.teamId
                        ? entry.teamId === myTeamId
                        : Boolean(
                            league &&
                              myIdx >= 0 &&
                              league.memberIds.indexOf(entry.userId) === myIdx,
                          ));
                    return (
                      <DraftLogRow
                        key={entry._id}
                        entry={entry}
                        pickNum={i + 1}
                        teamName={teamName}
                        isMyTeamPick={Boolean(isMyTeamPick)}
                        headshot={player?.headshot}
                        slotOptions={slotOptions}
                        teamOptions={teamOptions}
                        allRosterEntries={rosterEntries}
                        leagueRosterSlots={league?.rosterSlots ?? {}}
                        leagueBudget={league?.budget}
                        onUpdate={onUpdatePick}
                        onRemove={onRemovePick}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
