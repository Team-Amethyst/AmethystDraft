import { useEffect, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { RosterEntry } from "../../api/roster";
import { myDraftSlotsForPosition } from "../../constants/positionAllocationPlan";
import PosBadge from "../PosBadge";

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

  useEffect(() => {
    const fallback = myTeamId ?? "team_1";
    if (!league?.teamNames.length) return;
    setMakeupTeamId((prev) => {
      const n = parseInt(String(prev).replace(/^team_/i, ""), 10);
      const valid = Number.isFinite(n) && n >= 1 && n <= league.teamNames.length;
      return valid ? `team_${n}` : fallback;
    });
  }, [myTeamId, league?.teamNames]);

  const totalSlots = league
    ? Object.values(league.rosterSlots).reduce((a, b) => a + b, 0)
    : 0;
  const viewingOwnTargets =
    myTeamId != null && makeupTeamId !== "" && makeupTeamId === myTeamId;
  const teamMakeupEntries = makeupTeamId
    ? rosterEntries
        .filter((e) => e.teamId === makeupTeamId)
        .slice()
        .sort(
          (a, b) =>
            new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
            new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
        )
    : [];
  const teamEntriesBySlot = new Map<string, RosterEntry[]>();
  teamMakeupEntries.forEach((entry) => {
    const slotKey = entry.rosterSlot || "BN";
    const curr = teamEntriesBySlot.get(slotKey) ?? [];
    curr.push(entry);
    teamEntriesBySlot.set(slotKey, curr);
  });
  const teamMakeupRows = league
    ? Object.entries(league.rosterSlots).flatMap(([slot, count]) => {
        const entriesForSlot = teamEntriesBySlot.get(slot) ?? [];
        const totalTargetForPosition = viewingOwnTargets
          ? (savedPositionTargets[slot] ??
            Math.round((count / totalSlots) * (league.budget ?? 260)))
          : Math.round((count / totalSlots) * (league.budget ?? 260));
        /* My Draft “Per Slot” only for your team; other teams use even slot share of budget */
        const slotsForPerSlotDivisor = viewingOwnTargets
          ? (myDraftSlotsForPosition(slot) ?? count)
          : count;
        const perSlotTarget =
          slotsForPerSlotDivisor > 0 && Number.isFinite(totalTargetForPosition)
            ? totalTargetForPosition / slotsForPerSlotDivisor
            : null;
        return Array.from({ length: count }, (_, idx) => {
          const entry = entriesForSlot[idx];
          return {
            key: `${slot}-${idx}`,
            slot,
            playerName: entry?.playerName ?? "— empty —",
            target: perSlotTarget,
            price: entry?.price ?? null,
            filled: !!entry,
          };
        });
      })
    : [];
  const fmtDollar = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? `$${Math.round(n)}` : "—";
  const fmtPerSlotTarget = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "—";
    const s = (Math.round(n * 10) / 10).toFixed(1);
    return `$${s.endsWith(".0") ? s.slice(0, -2) : s}`;
  };

  return (
    <section className={sectionClassName}>
      <div className="pac-snapshot-header cc-team-makeup-head">
        <span className="market-section-label">TEAM MAKEUP</span>
        {league && league.teamNames.length > 0 ? (
          <select
            className="cc-team-makeup-select"
            aria-label="Roster to display"
            value={makeupTeamId}
            onChange={(e) => setMakeupTeamId(e.target.value)}
          >
            {league.teamNames.map((name, idx) => {
              const tid = `team_${idx + 1}`;
              const you = myTeamId != null && tid === myTeamId ? " (You)" : "";
              return (
                <option key={tid} value={tid}>
                  {name}
                  {you}
                </option>
              );
            })}
          </select>
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
