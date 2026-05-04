import { positionColorStyle } from "../constants/positionColors";
import "./PosBadge.css";

interface PosBadgeProps {
  pos: string;
  className?: string;
}

export default function PosBadge({ pos, className }: PosBadgeProps) {
  const c = positionColorStyle(pos);
  return (
    <span
      className={"pos-badge" + (className ? " " + className : "")}
      style={{ background: c.bg, color: c.color, borderColor: c.border }}
    >
      {pos}
    </span>
  );
}
