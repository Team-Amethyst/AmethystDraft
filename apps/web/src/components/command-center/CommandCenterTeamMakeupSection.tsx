import { useEffect, useMemo, useState } from "react";
import { AppSelect } from "../AppSelect";
import type { League } from "../../contexts/LeagueContext";
import type { RosterEntry } from "../../api/roster";
import { myDraftSlotsForPosition } from "../../constants/positionAllocationPlan";
import { activeAuctionEntriesForTeam } from "../../pages/command-center-utils/roster";
import { assignTeamEntriesToRosterRows } from "../../pages/command-center-utils/rosterAssignment";
import PosBadge from "../PosBadge";
import { resolvedLeagueTeamNames } from "../../utils/team";

export function CommandCenterTeamMakeupSection({
  league,
  rosterEntries,
  savedPositionTargets,
  myTeamId,
  sectionClassName,
}: {
  league: League | null;
  rosterEntries: RosterEntry[];
  savedPositionTargets: Record<string, number>;
  myTeamId: string | null;
  sectionClassName: string;
}) {
  const [makeupTeamId, setMakeupTeamId] = useState(() => myTeamId ?? "team_1");

  const displayTeamNames = league ? resolvedLeagueTeamNames(league) : [];

  useEffect(() => {
    const fallback = myTeamId ?? "team_1";
    if (!displayTeamNames.length) return;
    setMakeupTeamId((prev) => {
      const n = parseInt(String(prev).replace(/^team_/i, ""), 10);
      const valid = Number.isFinite(n) && n >= 1 && n <= displayTeamNames.length;
      return valid ? `team_${n}` : fallback;
    });
  }, [myTeamId, displayTeamNames.length]);

  const totalSlots = league
    ? Object.values(league.rosterSlots).reduce((a, b) => a + b, 0)
    : 0;
  const viewingOwnTargets =
    myTeamId != null && makeupTeamId !== "" && makeupTeamId === myTeamId;
  const teamMakeupEntries = makeupTeamId
    ? activeAuctionEntriesForTeam(rosterEntries, makeupTeamId)
    : [];
  const assignedRows =
    league != null
      ? assignTeamEntriesToRosterRows(league.rosterSlots, teamMakeupEntries)
      : [];
  const teamMakeupRows = league
    ? assignedRows.map((row, idx) => {
        const slot = row.position;
        const count = league.rosterSlots[slot] ?? 1;
        const slotIndex = assignedRows
          .slice(0, idx)
          .filter((r) => r.position === slot).length;
        const totalTargetForPosition = viewingOwnTargets
          ? (savedPositionTargets[slot] ??
            Math.round((count / totalSlots) * (league.budget ?? 260)))
          : Math.round((count / totalSlots) * (league.budget ?? 260));
        const slotsForPerSlotDivisor = viewingOwnTargets
          ? (myDraftSlotsForPosition(slot) ?? count)
          : count;
        const perSlotTarget =
          slotsForPerSlotDivisor > 0 && Number.isFinite(totalTargetForPosition)
            ? totalTargetForPosition / slotsForPerSlotDivisor
            : null;
        const entry = row.entry;
        return {
          key: `${slot}-${slotIndex}`,
          slot,
          playerName: entry?.playerName ?? "— empty —",
          target: perSlotTarget,
          price: entry?.price ?? null,
          filled: !!entry,
        };
      })
    : [];
  const fmtDollar = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? `$${Math.round(n)}` : "—";
  const fmtPerSlotTarget = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "—";
    const s = (Math.round(n * 10) / 10).toFixed(1);
    return `$${s.endsWith(".0") ? s.slice(0, -2) : s}`;
  };

  const makeupTeamOptions = useMemo(
    () =>
      displayTeamNames.map((name, idx) => {
        const tid = `team_${idx + 1}`;
        const you = myTeamId != null && tid === myTeamId ? " (You)" : "";
        return { value: tid, label: `${name}${you}` };
      }),
    [displayTeamNames, myTeamId],
  );

  return (
    <section className={sectionClassName}>
      <div className="pac-snapshot-header cc-team-makeup-head cc-panel-controls">
        <span className="market-section-label">TEAM MAKEUP</span>
        {league && makeupTeamOptions.length > 0 ? (
          <div className="stat-view-toggle cc-toolbar-team-picker">
            <AppSelect
              variant="toolbar"
              className="cc-toolbar-team-picker__select"
              aria-label="Roster to display"
              title={
                makeupTeamOptions.find((o) => o.value === makeupTeamId)?.label
              }
              value={makeupTeamId}
              onChange={setMakeupTeamId}
              options={makeupTeamOptions}
            />
          </div>
        ) : null}
      </div>
      <div className="team-makeup-slots">
        <div className="team-makeup-head-row" aria-hidden>
          <span className="team-makeup-head-badge-spacer" />
          <div className="team-makeup-head-player">Player</div>
          <div className="team-makeup-head-money team-makeup-head-money--target-col">
            Target
          </div>
          <div className="team-makeup-head-money team-makeup-head-money--paid-col">
            Paid
          </div>
        </div>
        {teamMakeupRows.map((row) => {
          const paidClass =
            row.price == null
              ? "dim"
              : row.target == null
                ? "dim"
                : row.price <= row.target
                  ? "green"
                  : "red";
          return (
            <div
              key={row.key}
              className={
                "team-makeup-slot-row" +
                (row.filled
                  ? " team-makeup-slot-row--filled"
                  : " team-makeup-slot-row--empty")
              }
            >
              <PosBadge pos={row.slot} />
              <div className="team-makeup-slot-player" title={row.playerName}>
                {row.playerName}
              </div>
              <div
                className="team-makeup-slot-money team-makeup-slot-money--target"
                title={
                  viewingOwnTargets
                    ? "Per-slot target $ (same as My Draft Position Allocation → Per Slot)"
                    : "Even slot share of league budget (not another team’s private targets)"
                }
              >
                {fmtPerSlotTarget(row.target)}
              </div>
              <div
                className={`team-makeup-slot-money team-makeup-slot-money--paid ${paidClass}`}
                title="Winning bid for this slot"
              >
                {fmtDollar(row.price)}
              </div>
            </div>
          );
        })}
        {teamMakeupRows.length === 0 && <div className="dim">No slots available.</div>}
      </div>
    </section>
  );
}
