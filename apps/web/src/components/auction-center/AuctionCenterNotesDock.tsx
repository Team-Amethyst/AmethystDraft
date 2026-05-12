import type { MouseEvent as ReactMouseEvent } from "react";

interface AuctionCenterNotesDockProps {
  heightPx: number;
  onResizeStart: (e: ReactMouseEvent<HTMLDivElement>) => void;
  noteValue: string;
  onNoteChange: (value: string) => void;
}

export function AuctionCenterNotesDock({
  heightPx,
  onResizeStart,
  noteValue,
  onNoteChange,
}: AuctionCenterNotesDockProps) {
  return (
    <section
      className="pac-notes-dock"
      aria-label="Draft notes"
      style={{ height: `${heightPx}px` }}
    >
      <div
        className="pac-notes-dock-resizer"
        onMouseDown={onResizeStart}
        title="Drag to resize draft notes"
        aria-hidden
      />
      <div className="pac-notes-dock-header">DRAFT NOTES</div>
      <textarea
        id="pac-note-draft"
        className="pac-notes pac-notes--dock-only"
        value={noteValue}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Draft strategy, targets, budget rules…"
        rows={5}
      />
    </section>
  );
}
