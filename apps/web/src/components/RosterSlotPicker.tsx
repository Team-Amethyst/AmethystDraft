import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useAnchoredOverlayPosition } from "../hooks/useAnchoredOverlayPosition";
import "./RosterSlotPicker.css";

export type RosterSlotPickerVariant = "command-center" | "modal";

export interface RosterSlotPickerProps {
  value: string;
  onChange: (slot: string) => void;
  /** Open slots in display order (e.g. league roster order). */
  orderedSlots: readonly string[];
  /** Subset of orderedSlots that match standard position eligibility. */
  eligibleSlots: readonly string[];
  disabled?: boolean;
  emptyLabel?: string;
  variant: RosterSlotPickerVariant;
  /** Highlight trigger when there is no slot to choose. */
  warn?: boolean;
  id?: string;
}

function useDismissOnOutsideAndEscape(
  open: boolean,
  setOpen: (v: boolean) => void,
  rootRef: React.RefObject<HTMLElement | null>,
  portalRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef, portalRef, setOpen]);
}

export function RosterSlotPicker({
  value,
  onChange,
  orderedSlots,
  eligibleSlots,
  disabled,
  emptyLabel = "— no open slots —",
  variant,
  warn,
  id,
}: RosterSlotPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const eligibleSet = useMemo(
    () => new Set(eligibleSlots),
    [eligibleSlots],
  );

  const displayRows = useMemo(() => {
    const eligibleOrdered = orderedSlots.filter((s) => eligibleSet.has(s));
    const ineligibleOrdered = orderedSlots.filter((s) => !eligibleSet.has(s));
    return [...eligibleOrdered, ...ineligibleOrdered];
  }, [orderedSlots, eligibleSet]);

  const panelStyle = useAnchoredOverlayPosition(open, triggerRef, {
    floatingRef: portalRef,
    maxWidth: 280,
    estimatedItemCount: displayRows.length,
    estimatedItemHeight: 20.48,
    estimatedPadding: 6,
  });

  useDismissOnOutsideAndEscape(open, setOpen, rootRef, portalRef);

  const isEmpty = orderedSlots.length === 0;
  const showValue = Boolean(value && orderedSlots.includes(value));
  const fallbackSlot =
    eligibleSlots.find((s) => orderedSlots.includes(s)) ?? orderedSlots[0];
  const triggerLabel = isEmpty
    ? emptyLabel
    : showValue
      ? value
      : (fallbackSlot ?? emptyLabel);

  const rootClass =
    "rsp " +
    (variant === "command-center" ? "rsp--cc" : "rsp--modal") +
    (warn || isEmpty ? " rsp--warn" : "") +
    (open ? " rsp--open" : "") +
    (disabled ? " rsp--disabled" : "");

  const isLogResult = variant === "command-center";
  const panelClassName =
    "rsp-panel pac-log-dropdown-menu" +
    (variant === "modal" ? " rsp-panel--modal" : " rsp-panel--cc");

  const panel = (
    <ul className={panelClassName} role="listbox">
      {displayRows.map((slot) => {
        const eligible = eligibleSet.has(slot);
        return (
          <li key={slot} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === slot}
              className={
                "rsp-option" +
                (eligible ? " rsp-option--eligible" : " rsp-option--ineligible")
              }
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(slot);
                setOpen(false);
              }}
            >
              <span className="rsp-option-label">{slot}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={rootClass} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="rsp-trigger"
        disabled={disabled || isEmpty}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Roster slot"
        onClick={() => {
          if (disabled || isEmpty) return;
          setOpen((o) => !o);
        }}
      >
        <span className="rsp-trigger-value">{triggerLabel}</span>
        <ChevronDown className="rsp-chevron" size={14} strokeWidth={2.25} aria-hidden />
      </button>
      {open && !isEmpty
        ? createPortal(
            <div
              ref={portalRef}
              className={
                "rsp-portal-host" + (isLogResult ? " rsp-portal-host--pac-log" : "")
              }
              style={{
                ...panelStyle,
                ["--pac-log-option-count" as string]: displayRows.length,
              }}
            >
              {panel}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
