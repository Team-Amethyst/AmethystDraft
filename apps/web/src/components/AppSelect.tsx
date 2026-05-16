import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import "./AppSelect.css";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** `toolbar` matches Command Center header controls (Hitting/Pitching toggle row). */
export type AppSelectVariant = "default" | "toolbar";

type AppSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly AppSelectOption[];
  className?: string;
  "aria-label"?: string;
  /** Shown on the trigger (native `title`) for tooltips. */
  title?: string;
  compact?: boolean;
  block?: boolean;
  disabled?: boolean;
  /** Use `toolbar` in panel headers; native `<select>` cannot style the open list. */
  variant?: AppSelectVariant;
};

/**
 * Themed dropdown (button + styled menu). Prefer this over native `<select>` whenever
 * the open list must match app chrome — especially in Command Center / Research toolbars.
 */
export function AppSelect({
  id,
  value,
  onChange,
  options,
  className = "",
  "aria-label": ariaLabel,
  title,
  compact = false,
  block = false,
  disabled = false,
  variant = "default",
}: AppSelectProps) {
  const isToolbar = variant === "toolbar";
  const isCompact = compact || isToolbar;
  const autoId = useId();
  const listboxId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={[
        "app-select-root",
        isCompact ? "app-select-root--compact" : "",
        isToolbar ? "app-select-root--toolbar" : "",
        block ? "app-select-root--block" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        id={id}
        className="app-select-trigger"
        title={title}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        <span className="app-select-trigger-label">
          {selected?.label ?? value}
        </span>
        <ChevronDown
          size={isCompact ? 12 : 14}
          className={"app-select-trigger-chevron" + (open ? " is-open" : "")}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={listboxId}
          className="app-select-menu"
          role="listbox"
          aria-orientation="vertical"
          aria-label={ariaLabel}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const isDisabled = Boolean(opt.disabled);
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  className={
                    "app-select-option" + (isSelected ? " is-selected" : "")
                  }
                  onClick={() => {
                    if (isDisabled) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
