import { useEffect, useState } from "react";
import CustomPlayerHeadshot from "./CustomPlayerHeadshot";

const TIER_COLORS: Record<number, string> = {
  1: "#a855f7",
  2: "#6366f1",
  3: "#22c55e",
  4: "#f59e0b",
  5: "#6b7280",
};

export function TierBadge({ tier }: { tier: number }) {
  return (
    <span
      className="tier-badge"
      style={{ background: TIER_COLORS[tier] ?? "#6b7280" }}
    >
      {tier}
    </span>
  );
}

export function PlayerHeadshot({
  src,
  name,
  isCustom,
}: {
  src: string;
  name: string;
  isCustom?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (isCustom) {
    return <CustomPlayerHeadshot size={32} />;
  }
  if (failed || !src) {
    return <div className="headshot-fallback">{initials}</div>;
  }
  return (
    <img
      src={src}
      alt={name}
      className="player-headshot"
      onError={() => setFailed(true)}
    />
  );
}

export function NoteCell({
  playerId,
  getNote,
  onNoteChange,
}: {
  playerId: string;
  playerName: string;
  tags: string[];
  getNote: (id: string) => string;
  onNoteChange: (id: string, note: string) => void;
}) {
  const [value, setValue] = useState(() => getNote(playerId));

  const contextNote = getNote(playerId);
  useEffect(() => {
    setValue(contextNote);
  }, [contextNote]);

  return (
    <input
      className="pt-note-input"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onNoteChange(playerId, e.target.value);
      }}
      placeholder="Add note..."
      title={value}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function asFinite(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function SortArrow({
  col,
  sort,
}: {
  col: string;
  sort: { col: string; dir: "asc" | "desc" } | null;
}) {
  if (sort?.col !== col)
    return <span className="th-sort-icon th-sort-idle">↕</span>;
  return (
    <span className="th-sort-icon th-sort-active">
      {sort.dir === "asc" ? "▲" : "▼"}
    </span>
  );
}
