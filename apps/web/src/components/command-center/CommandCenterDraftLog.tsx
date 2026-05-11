import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import { DraftLogRow } from "../DraftLogRow";

type DraftPickVm = {
  entry: RosterEntry;
  pickNum: number;
  teamName: string;
  player: Player | undefined;
  isMyTeamPick: boolean;
};

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
  const listRef = useRef<HTMLDivElement>(null);
  const prevPickCountRef = useRef(0);

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

  const picksView = useMemo((): DraftPickVm[] => {
    const myIdx =
      myTeamId != null
        ? parseInt(myTeamId.replace("team_", ""), 10) - 1
        : -1;
    return sorted.map((entry, i) => {
      const teamIdx = entry.teamId
        ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
        : (league?.memberIds.indexOf(entry.userId) ?? -1);
      const teamName =
        teamIdx >= 0
          ? (league?.teamNames[teamIdx] ?? entry.teamId ?? entry.userId)
          : (entry.teamId ?? entry.userId);
      const player = playerMap.get(entry.externalPlayerId);
      const isMyTeamPick =
        myTeamId != null &&
        (entry.teamId
          ? entry.teamId === myTeamId
          : Boolean(
              league &&
                myIdx >= 0 &&
                league.memberIds.indexOf(entry.userId) === myIdx,
            ));
      return {
        entry,
        pickNum: i + 1,
        teamName,
        player,
        isMyTeamPick: Boolean(isMyTeamPick),
      };
    });
  }, [sorted, league, myTeamId, playerMap]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || sorted.length === 0) {
      prevPickCountRef.current = sorted.length;
      return;
    }
    if (sorted.length > prevPickCountRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevPickCountRef.current = sorted.length;
  }, [sorted.length]);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isModalOpen]);

  const sharedRowProps = useMemo(
    () => ({
      slotOptions,
      teamOptions,
      allRosterEntries: rosterEntries,
      leagueRosterSlots: league?.rosterSlots ?? {},
      leagueBudget: league?.budget,
      onUpdate: onUpdatePick,
      onRemove: onRemovePick,
    }),
    [
      slotOptions,
      teamOptions,
      rosterEntries,
      league?.rosterSlots,
      league?.budget,
      onUpdatePick,
      onRemovePick,
    ],
  );

  const draftCountLabel =
    sorted.length === 1 ? "1 pick" : `${sorted.length} picks`;

  return (
    <div className="cc-draft-log-root">
      <div className="market-section-label market-section-label--spaced cc-draft-log-heading">
        <span className="cc-draft-log-heading-title">DRAFT LOG</span>
        <span className="cc-draft-log-heading-meta">
          <span
            className="cc-draft-log-count"
            title={
              sorted.length > 0
                ? "Newest pick at bottom — scroll up for earlier picks"
                : undefined
            }
          >
            {draftCountLabel}
          </span>
          <button
            type="button"
            className="cc-draft-log-expand"
            onClick={() => setIsModalOpen(true)}
            aria-haspopup="dialog"
            aria-label="Open full draft log in a larger window"
            title="Open full draft log in a larger window"
          >
            <Maximize2 className="cc-draft-log-expand-icon" aria-hidden strokeWidth={2} />
            <span className="cc-draft-log-expand-text">Full view</span>
          </button>
        </span>
      </div>

      <div className="cc-draft-log-panel">
        <div
          ref={listRef}
          className="draft-log-list draft-log-list--inline"
          role="log"
          aria-label="Draft log, recent picks"
          aria-live="polite"
          aria-relevant="additions"
        >
          {sorted.length === 0 ? (
            <div className="cc-draft-log-inline-empty">
              No picks logged yet. Winning bids show up here in pick order.
            </div>
          ) : (
            picksView.map(
              ({ entry, pickNum, teamName, player, isMyTeamPick }) => (
                <DraftLogRow
                  key={entry._id}
                  entry={entry}
                  pickNum={pickNum}
                  teamName={teamName}
                  isMyTeamPick={isMyTeamPick}
                  headshot={player?.headshot}
                  variant="compact"
                  {...sharedRowProps}
                />
              ),
            )
          )}
        </div>
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
                  {picksView.map(
                    ({ entry, pickNum, teamName, player, isMyTeamPick }) => (
                      <DraftLogRow
                        key={`modal-${entry._id}`}
                        entry={entry}
                        pickNum={pickNum}
                        teamName={teamName}
                        isMyTeamPick={isMyTeamPick}
                        headshot={player?.headshot}
                        {...sharedRowProps}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
