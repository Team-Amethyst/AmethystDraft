import type { ReactNode, RefObject } from "react";
import "./DraftLogTable.css";

export type DraftLogTableVariant = "compact" | "dense";

export function DraftLogTable({
  variant,
  children,
  className,
  scrollBody = false,
  bodyRef,
}: {
  variant: DraftLogTableVariant;
  children: ReactNode;
  className?: string;
  /** When true, only `.draft-log-table-body` scrolls; header stays pinned above rows. */
  scrollBody?: boolean;
  bodyRef?: RefObject<HTMLDivElement | null>;
}) {
  const isCompact = variant === "compact";

  return (
    <div
      className={
        "draft-log-table" +
        (isCompact ? " draft-log-table--compact" : " draft-log-table--dense") +
        (scrollBody ? " draft-log-table--scroll-body" : "") +
        (className ? ` ${className}` : "")
      }
    >
      <div className="dl-table-header" role="row" aria-hidden>
        <span className="dl-th dl-th--pick">#</span>
        <span className="dl-th dl-th--photo" />
        <span className="dl-th dl-th--player">Player</span>
        {!isCompact ? (
          <>
            <span className="dl-th dl-th--mlb">MLB</span>
            <span className="dl-th dl-th--team">Team</span>
          </>
        ) : null}
        <span className="dl-th dl-th--slot">Slot</span>
        <span className="dl-th dl-th--price">$</span>
        {!isCompact ? <span className="dl-th dl-th--actions" /> : null}
      </div>
      <div ref={bodyRef} className="draft-log-table-body">
        {children}
      </div>
    </div>
  );
}
