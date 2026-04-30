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

/** Footer / helper copy aligned with catalog API fields. */
export function statBasisFooterDescription(basis: StatBasis): string {
  if (basis === "projections") {
    return "PROJ · API projection (5/3/2 season weights)";
  }
  if (basis === "last-year") {
    return "1Y · API last completed season (`stats`)";
  }
  return "3Y · API equal-weight 3-season blend (`stats3yr`)";
}

export function statBasisAllValues(): readonly StatBasis[] {
  return STAT_BASIS_VALUES;
}
