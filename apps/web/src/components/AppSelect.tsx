import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useAnchoredOverlayPosition } from "../hooks/useAnchoredOverlayPosition";
import "./AppSelect.css";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** `toolbar` matches Command Center header controls (Hitting/Pitching toggle row). */
export type AppSelectVariant = "default" | "toolbar";

type AppSelectMenuTheme = "pt-filter" | "log-result" | "my-draft" | null;

function resolveAppSelectMenuTheme(className: string): AppSelectMenuTheme {
  if (className.includes("pt-filter-field")) return "pt-filter";
  if (className.includes("pac-log-select") || className.includes("log-select")) {
    return "log-result";
  }
  if (className.includes("md-select")) return "my-draft";
  return null;
}

function portalHostClassName(
  theme: AppSelectMenuTheme,
  isToolbar: boolean,
  className: string,
): string {
  const base = "app-select-portal-host";
  if (isToolbar) {
    return [
      base,
      "app-select-portal-host--toolbar",
      className.includes("cc-toolbar-team-picker")
        ? "app-select-portal-host--cc-team-picker"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (theme === "pt-filter") return `${base} pt-control-theme`;
  if (theme === "log-result") return `${base} app-select-portal-host--log-result`;
  if (theme === "my-draft") return `${base} app-select-portal-host--my-draft`;
  return base;
}

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
  /**
   * Render the menu in a document portal (fixed to the trigger). Default: on for
   * non-toolbar selects so menus escape overflow scroll parents (e.g. Research filters).
   */
  menuPortal?: boolean;
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
  menuPortal: menuPortalProp,
}: AppSelectProps) {
  const isToolbar = variant === "toolbar";
  const isCompact = compact || isToolbar;
  const menuPortal = menuPortalProp ?? !isToolbar;
  const autoId = useId();
  const listboxId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const portalHostRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const menuTheme = resolveAppSelectMenuTheme(className);
  const isLogResultMenu = menuTheme === "log-result";
  const menuStyle = useAnchoredOverlayPosition(open && menuPortal, triggerRef, {
    floatingRef: portalHostRef,
    estimatedItemCount: options.length,
    estimatedItemHeight: isLogResultMenu ? 20.48 : isCompact ? 26 : 32,
    estimatedPadding: isLogResultMenu ? 6 : isCompact ? 10 : 14,
    maxEstimatedHeight: isLogResultMenu ? options.length * 20.48 + 6 : 256,
  });
  const menuClassName = [
    "app-select-menu",
    isCompact ? "app-select-menu--compact" : "",
    menuTheme === "pt-filter" ? "app-select-menu--pt-filter" : "",
    menuTheme === "log-result" ? "app-select-menu--log-result pac-log-dropdown-menu" : "",
    menuTheme === "my-draft" ? "app-select-menu--my-draft" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const portalHostStyle =
    open && menuPortal && isLogResultMenu
      ? {
          ...menuStyle,
          ["--pac-log-option-count" as string]: options.length,
        }
      : menuStyle;

  const renderMenuOptions = () =>
    options.map((opt) => {
      const isSelected = opt.value === value;
      const isDisabled = Boolean(opt.disabled);
      return (
        <li key={opt.value} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={isDisabled}
            className={"app-select-option" + (isSelected ? " is-selected" : "")}
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
    });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuPortal && portalHostRef.current?.contains(target)) return;
      if (!menuPortal && menuRef.current?.contains(target)) return;
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
  }, [open, menuPortal]);

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
        ref={triggerRef}
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
      {open
        ? menuPortal
          ? createPortal(
              <div
                ref={portalHostRef}
                className={portalHostClassName(menuTheme, isToolbar, className)}
                style={portalHostStyle}
              >
                <ul
                  ref={menuRef}
                  id={listboxId}
                  className={menuClassName}
                  role="listbox"
                  aria-orientation="vertical"
                  aria-label={ariaLabel}
                >
                  {renderMenuOptions()}
                </ul>
              </div>,
              document.body,
            )
          : (
              <ul
                ref={menuRef}
                id={listboxId}
                className={menuClassName}
                role="listbox"
                aria-orientation="vertical"
                aria-label={ariaLabel}
              >
                {renderMenuOptions()}
              </ul>
            )
        : null}
    </div>
  );
}
