import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import PosBadge from "../PosBadge";
import type { RosterSlot } from "../../types/league";
import { POSITION_LABELS } from "../../features/leagues/shared";
import "./LeagueRosterSlotsEditor.css";

interface LeagueRosterSlotsEditorProps {
  rosterSlots: RosterSlot[];
  totalRosterSpots: number;
  onSetRosterCount: (position: string, count: number) => void;
  onResetRosterSlots?: () => void;
  className?: string;
}

export function LeagueRosterSlotsEditor({
  rosterSlots,
  totalRosterSpots,
  onSetRosterCount,
  onResetRosterSlots,
  className,
}: LeagueRosterSlotsEditorProps) {
  const slotCountMap = useMemo(
    () =>
      Object.fromEntries(rosterSlots.map((slot) => [slot.position, slot.count])),
    [rosterSlots],
  );
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraftCounts(
      Object.fromEntries(
        rosterSlots.map((slot) => [slot.position, String(slot.count)]),
      ),
    );
  }, [rosterSlots]);

  const normalizeCount = (raw: string) => Math.max(0, Number(raw || "0") || 0);

  return (
    <div
      className={
        "league-roster-editor" + (className ? ` ${className}` : "")
      }
    >
      <div className="league-roster-editor-header">
        <span>Position</span>
        <div className="league-roster-editor-header-right">
          <span>Count</span>
          {onResetRosterSlots && (
            <button
              type="button"
              className="league-roster-editor-reset-btn"
              onClick={onResetRosterSlots}
              title="Reset roster slots"
              aria-label="Reset roster slots"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
      {rosterSlots.map((slot) => (
        <div key={slot.position} className="league-roster-editor-row">
          <div className="league-roster-editor-position">
            <PosBadge pos={slot.position} />
            <span className="league-roster-editor-position-name">
              {POSITION_LABELS[slot.position] ?? slot.position}
            </span>
          </div>
          <div className="league-roster-editor-controls">
            <input
              type="text"
              inputMode="numeric"
              value={draftCounts[slot.position] ?? String(slot.count)}
              aria-label={`${slot.position} slot count`}
              onChange={(e) => {
                const next = e.target.value;
                if (!/^\d*$/.test(next)) return;
                setDraftCounts((prev) => ({ ...prev, [slot.position]: next }));
              }}
              onBlur={() => {
                const nextCount = normalizeCount(draftCounts[slot.position] ?? "");
                onSetRosterCount(slot.position, nextCount);
                setDraftCounts((prev) => ({
                  ...prev,
                  [slot.position]: String(nextCount),
                }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.currentTarget as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  setDraftCounts((prev) => ({
                    ...prev,
                    [slot.position]: String(slotCountMap[slot.position] ?? 0),
                  }));
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="league-roster-editor-count-input"
            />
          </div>
        </div>
      ))}
      <div className="league-roster-editor-total">
        Total: {totalRosterSpots} roster spots
      </div>
    </div>
  );
}
