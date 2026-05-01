import { useLayoutEffect, useMemo, useRef } from "react";
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
  const listRef = useRef<HTMLDivElement>(null);
  const prevPickCountRef = useRef(0);
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

  return (
    <>
      <div className="market-section-label market-section-label--spaced">
        DRAFT LOG
      </div>
      <div ref={listRef} className="draft-log-list">
        {sorted.length === 0 && <div className="dl-empty">No picks yet.</div>}
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
            myTeamId != null ? parseInt(myTeamId.replace("team_", ""), 10) - 1 : -1;
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
    </>
  );
}
