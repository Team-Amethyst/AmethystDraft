import { useEffect, useMemo, useRef, useState } from "react";
import "./KeeperSlotSelectWithOverride.css";

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
  const eligibleSet = useMemo(() => new Set(eligibleSlots), [eligibleSlots]);
  const showOverrideToggle =
    eligibleSlots.length > 0 &&
    assignableSlots.some((s) => !eligibleSet.has(s));

  const [overrideAnyOpen, setOverrideAnyOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setOverrideAnyOpen(false);
  }, [eligibleSlots.join("|"), assignableSlots.join("|")]);

  const activeOptions = useMemo(() => {
    if (eligibleSlots.length === 0) return assignableSlots;
    if (!showOverrideToggle) return eligibleSlots;
    return overrideAnyOpen ? assignableSlots : eligibleSlots;
  }, [
    assignableSlots,
    eligibleSlots,
    overrideAnyOpen,
    showOverrideToggle,
  ]);

  useEffect(() => {
    if (activeOptions.length === 0) return;
    if (!activeOptions.includes(value)) {
      onChangeRef.current(activeOptions[0]!);
    }
  }, [activeOptions, value]);

  const disabled = activeOptions.length === 0;

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
        {showOverrideToggle ? (
          <label className="keeper-slot-override-toggle">
            <input
              type="checkbox"
              checked={overrideAnyOpen}
              onChange={(e) => setOverrideAnyOpen(e.target.checked)}
            />
            <span>Any open slot</span>
          </label>
        ) : null}
        <select
          className={selectClassName}
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
      {showIneligibleHint &&
      eligibleSlots.length === 0 &&
      assignableSlots.length > 0 ? (
        <p className="keeper-slot-override-hint">
          Not position-eligible on defaults; pick any open roster slot.
        </p>
      ) : null}
    </div>
  );
}
