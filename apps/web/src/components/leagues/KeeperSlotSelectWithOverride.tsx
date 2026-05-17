import { useEffect, useMemo, useRef } from "react";
import "./KeeperSlotSelectWithOverride.css";

/**
 * Roster slot dropdown for keepers. Uses open roster capacity (`assignableSlots`) when
 * non-empty so commissioners can place a player in any legal roster opening without a
 * separate "override" control; falls back to position-eligible slots otherwise.
 */
export function KeeperSlotSelectWithOverride({
  eligibleSlots,
  assignableSlots,
  value,
  onChange,
  selectClassName,
  labelClassName,
  hideLabel,
  compact,
  rootClassName,
  showIneligibleHint = true,
}: {
  eligibleSlots: string[];
  assignableSlots: string[];
  value: string;
  onChange: (slot: string) => void;
  selectClassName: string;
  labelClassName?: string;
  /** Omit the "Slot" heading (e.g. roster grid cell). */
  hideLabel?: boolean;
  /** Tighter spacing for inline roster rows. */
  compact?: boolean;
  /** Merged onto the outer wrapper (e.g. grid cell utility class). */
  rootClassName?: string;
  /** When false, omit the “not position-eligible” helper (e.g. tight roster rows). */
  showIneligibleHint?: boolean;
}) {
  const activeOptions = useMemo(() => {
    if (assignableSlots.length > 0) return assignableSlots;
    return eligibleSlots;
  }, [assignableSlots, eligibleSlots]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (activeOptions.length === 0) return;
    if (!activeOptions.includes(value)) {
      onChangeRef.current(activeOptions[0]!);
    }
  }, [activeOptions, value]);

  const disabled = activeOptions.length === 0;

  const showNonEligibleHint =
    showIneligibleHint &&
    eligibleSlots.length === 0 &&
    assignableSlots.length > 0;

  return (
    <div
      className={
        "keeper-slot-override-root" +
        (compact ? " keeper-slot-override-root--compact" : "") +
        (rootClassName ? ` ${rootClassName}` : "")
      }
    >
      <div
        className={
          (labelClassName ?? "keeper-slot-override-field") +
          (hideLabel ? " keeper-slot-override-field--no-heading" : "")
        }
      >
        {!hideLabel ? <span>Slot</span> : null}
        <select
          className={`app-select app-select--compact ${selectClassName}`}
          value={value}
          disabled={disabled}
          aria-label={hideLabel ? "Roster slot" : undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          {activeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {showNonEligibleHint ? (
        <p className="keeper-slot-override-hint">
          Not position-eligible on defaults; pick any open roster slot.
        </p>
      ) : null}
    </div>
  );
}
