import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import "./AppSelect.css";

export type AppSelectOption = {
  value: string;
  label: string;
};

type AppSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly AppSelectOption[];
  className?: string;
  "aria-label"?: string;
  compact?: boolean;
  block?: boolean;
};

/** Themed dropdown (button + menu) — use instead of native `<select>` when the open list must match app chrome. */
export function AppSelect({
  id,
  value,
  onChange,
  options,
  className = "",
  "aria-label": ariaLabel,
  compact = false,
  block = false,
}: AppSelectProps) {
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
        compact ? "app-select-root--compact" : "",
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
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="app-select-trigger-label">
          {selected?.label ?? value}
        </span>
        <ChevronDown
          size={compact ? 12 : 14}
          className={"app-select-trigger-chevron" + (open ? " is-open" : "")}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={listboxId}
          className="app-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={
                    "app-select-option" + (isSelected ? " is-selected" : "")
                  }
                  onClick={() => {
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
