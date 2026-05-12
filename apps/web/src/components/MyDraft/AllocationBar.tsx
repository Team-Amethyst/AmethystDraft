/**
 * AllocationBar
 *
 * Renders the visual budget allocation bar and its legend.
 * Observes positionTargets and totalBudget — pure display, no local state.
 *
 * Design Pattern: Observer — reacts to positionTargets changes pushed down from MyDraft.
 * Design Principle: Single Responsibility — only concerned with visualizing budget splits.
 */

import "./AllocationBar.css";

interface Segment {
  pos: string;
  slots: number;
  target: number;
  color: string;
  pct: number;
}

interface AllocationBarProps {
  segments: Segment[];
  bufferPct: number;
  bufferAmount: number;
}

export default function AllocationBar({
  segments,
  bufferPct,
  bufferAmount,
}: AllocationBarProps) {
  return (
    <div className="top-split">
      <div className="split-label">Position Allocation</div>
      <div className="alloc-bar">
        {segments.map((seg) => (
          <div
            key={seg.pos}
            className="alloc-bar-seg"
            style={{ width: `${seg.pct}%`, background: seg.color }}
            title={`${seg.pos}  $${seg.target}`}
          >
            {seg.slots > 1 &&
              Array.from({ length: seg.slots - 1 }).map((_, i) => (
                <span
                  key={i}
                  className="alloc-bar-tick"
                  style={{ left: `${((i + 1) / seg.slots) * 100}%` }}
                />
              ))}
            <span className="alloc-bar-label">{seg.pos}</span>
          </div>
        ))}
        {bufferPct > 0 && (
          <div
            className="alloc-bar-seg alloc-bar-buffer"
            style={{ width: `${bufferPct}%` }}
            title={`Buffer  $${bufferAmount}`}
          />
        )}
      </div>
      <div className="alloc-bar-legend">
        {segments.map((seg) => (
          <span key={seg.pos} className="abl-item">
            <span className="abl-dot" style={{ background: seg.color }} />
            <span className="abl-pos">{seg.pos}</span>
            <span className="abl-val">${seg.target}</span>
          </span>
        ))}
      </div>
    </div>
  );
}