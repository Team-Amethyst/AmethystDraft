import type { StatBasis } from "./types";
import { STAT_BASIS_VALUES } from "./types";

export function isStatBasis(value: string | null | undefined): value is StatBasis {
  return (
    value === "projections" || value === "last-year" || value === "3-year-avg"
  );
}

export function parseStatBasis(
  raw: string | null | undefined,
  fallback: StatBasis,
): StatBasis {
  if (isStatBasis(raw)) return raw;
  return fallback;
}

/** Short label for pills / chips (no calendar year — non-projection views are still approximations in UI). */
export function statBasisPillLabel(basis: StatBasis): string {
  if (basis === "projections") return "PROJ";
  if (basis === "last-year") return "1Y";
  return "3Y";
}

/** Footer / helper copy aligned with API: `projection` = weighted blend; `stats` = last completed MLB season. */
export function statBasisFooterDescription(basis: StatBasis): string {
  if (basis === "projections") {
    return "PROJ · weighted multi-year projection (5/3/2)";
  }
  if (basis === "last-year") {
    return "1Y · last completed season + display-only smoothing (see code)";
  }
  return "3Y · display-only smoothing (not a true 3-year line yet)";
}

export function statBasisAllValues(): readonly StatBasis[] {
  return STAT_BASIS_VALUES;
}
