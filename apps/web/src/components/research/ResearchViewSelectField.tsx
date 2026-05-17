import { AppSelect, type AppSelectOption } from "../AppSelect";

export type ResearchViewSelectFieldProps = {
  id: string;
  /** Short label above the control — explains what this filter does. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly AppSelectOption[];
  /** Optional class on the select root (e.g. width modifiers). */
  selectClassName?: string;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
};

/**
 * Labeled select for Research sub-views (Tiers, Depth Charts).
 * Standalone field — not grouped in the Players table filter track.
 */
export function ResearchViewSelectField({
  id,
  label,
  value,
  onChange,
  options,
  selectClassName = "",
  "aria-label": ariaLabel,
  title,
  disabled,
}: ResearchViewSelectFieldProps) {
  return (
    <div className="research-view-field">
      <label className="research-view-field__label" htmlFor={id}>
        {label}
      </label>
      <AppSelect
        id={id}
        className={["research-view-select", selectClassName].filter(Boolean).join(" ")}
        compact
        value={value}
        onChange={onChange}
        options={options}
        aria-label={ariaLabel ?? label}
        title={title}
        disabled={disabled}
      />
    </div>
  );
}
