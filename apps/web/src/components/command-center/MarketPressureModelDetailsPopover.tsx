import {
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { MarketPressureDetailGroup } from "../../pages/commandCenterMarket";

export function MarketPressureModelDetailsPopover({
  id,
  anchorRef,
  onClose,
  contextLine,
  detailGroups,
}: {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  contextLine: string;
  detailGroups: MarketPressureDetailGroup[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const ar = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const pad = 10;
    let top = ar.bottom + 8;
    let left = ar.left;
    if (left + pw > window.innerWidth - pad) {
      left = window.innerWidth - pad - pw;
    }
    if (left < pad) left = pad;
    if (top + ph > window.innerHeight - pad) {
      top = ar.top - ph - 8;
    }
    if (top < pad) top = pad;
    panel.style.position = "fixed";
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.zIndex = "4000";
  };

  useLayoutEffect(() => {
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const panel = panelRef.current;
      const anchor = anchorRef.current;
      const t = e.target as Node;
      if (!panel) return;
      if (panel.contains(t)) return;
      if (anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [anchorRef, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      className="mp-model-details-popover"
      role="dialog"
      aria-modal="false"
      aria-label="Model details"
    >
      <div className="mp-model-details-popover__title">Model details</div>
      <p className="mp-model-details-popover__context">{contextLine}</p>
      <div className="mp-model-details-popover__groups">
        {detailGroups.map((group) => (
          <section
            key={group.id}
            className="mp-model-details-group"
            title={group.title}
          >
            <h3 className="mp-model-details-group__heading">{group.heading}</h3>
            <p className="mp-model-details-group__explanation">
              {group.explanation}
            </p>
            <p className="mp-model-details-group__metric">{group.metricLine}</p>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
