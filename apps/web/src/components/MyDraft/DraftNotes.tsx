/**
 * DraftNotes
 *
 * Renders the resizable draft notes textarea at the bottom of My Draft.
 *
 * Design Pattern: Observer — observes the "__draft__" note subject from
 *   PlayerNotesContext via the value prop; notifies MyDraft of changes via onChange.
 * Design Principle: Single Responsibility — only handles the notes strip UI
 *   and drag-to-resize interaction.
 */

import { useRef, useState } from "react";
import "./DraftNotes.css";

interface DraftNotesProps {
  value: string;
  onChange: (value: string) => void;
}

export default function DraftNotes({ value, onChange }: DraftNotesProps) {
  const [height, setHeight] = useState(96);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(96);

  const handleResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - dragStartYRef.current;
      // Drag up grows the box, drag down shrinks it
      setHeight(Math.max(58, dragStartHeightRef.current - deltaY));
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <section className="notes-strip panel-card">
      <div className="card-label">Draft Notes</div>
      <button
        type="button"
        className="notes-resize-handle"
        onMouseDown={handleResizeStart}
        aria-label="Resize draft notes box"
        title="Drag to resize"
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add your draft notes here..."
        style={{ height: `${height}px` }}
      />
    </section>
  );
}