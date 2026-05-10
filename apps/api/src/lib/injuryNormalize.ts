/**
 * Canonical Draftroom injury severity for Engine and catalog rows.
 * Primary source: MLB 40-man roster `status.code` + `status.description`.
 *
 * Severity mapping (Engine `injury_overrides[].injury_severity`):
 * | Tier | Meaning                         | Typical signals                          |
 * |------|----------------------------------|------------------------------------------|
 * | 0    | Healthy / no evidence            | Active (`A`), empty status, or no row    |
 * | 1    | Minor / day-to-day / non-IL list | DTD text, bereavement, MIN w/o desc, …   |
 * | 2    | Short IL                         | `D7`/`D10`/`D15`, 7–15-day IL wording    |
 * | 3    | Long IL / major                  | `D60`, 60-day / season-ending wording    |
 *
 * Display chips (`injuryStatus`) preserve `IL7`…`IL60` from roster codes; when codes are
 * missing, chips are inferred from description (`IL10`, `DTD`, …) — see
 * {@link injuryStatusDisplayFrom40ManStatus}.
 */

export type InjurySeverityLevel = 0 | 1 | 2 | 3;

/** Display labels for standard IL roster codes (UI chip). */
export const IL_ROSTER_DISPLAY_LABEL: Record<string, string> = {
  D7: "IL7",
  D10: "IL10",
  D15: "IL15",
  D60: "IL60",
};

export function injuryStatusLabelFromRosterCode(
  code: string | undefined,
): string | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  return IL_ROSTER_DISPLAY_LABEL[c];
}

/** MLB roster codes that imply severity even when `description` is blank on sparse roster dumps. */
const NON_IL_LIST_CODE_SEVERITY: Record<string, InjurySeverityLevel> = {
  MIN: 1,
  BRV: 1,
  FAM: 1,
  PAT: 1,
  MAT: 1,
  SUS: 1,
};

function severityFromSparseRosterCodeOnly(code: string): InjurySeverityLevel | undefined {
  return NON_IL_LIST_CODE_SEVERITY[code];
}

/**
 * UI chip for Research / Command Center — aligns with {@link injurySeverityFrom40ManStatus}
 * when the roster API omits standard `D10`/`D60` codes but still sends IL language in `description`.
 */
export function injuryStatusDisplayFrom40ManStatus(
  code: string | undefined,
  description: string | undefined,
): string | undefined {
  const fromCode = injuryStatusLabelFromRosterCode(code);
  if (fromCode) return fromCode;

  const d = (description ?? "").trim().toLowerCase();
  if (!d || d === "active") return undefined;

  if (
    /\b60[-\s]?day\b/.test(d) ||
    /\bil\s*60\b/.test(d) ||
    /\b60\s*day\s*(injured|il)\b/.test(d)
  ) {
    return "IL60";
  }
  if (/\b15[-\s]?day\b/.test(d)) return "IL15";
  if (/\b10[-\s]?day\b/.test(d)) return "IL10";
  if (/\b7[-\s]?day\b/.test(d)) return "IL7";

  if (
    /\bday[-\s]?to[-\s]?day\b/.test(d) ||
    /\bquestionable\b/.test(d) ||
    /\bdoubtful\b/.test(d) ||
    /\bprobable\b/.test(d)
  ) {
    return "DTD";
  }

  return undefined;
}

/**
 * Maps 40-man status to severity for Engine `injury_overrides`.
 * - 0: no injury evidence
 * - 1: day-to-day / minor / uncertainty / non-IL lists (bereavement, paternity, …)
 * - 2: IL7 / IL10 / IL15 (D7 / D10 / D15)
 * - 3: IL60 / long-term / major injury signals in text
 */
export function injurySeverityFrom40ManStatus(
  code: string | undefined,
  description: string | undefined,
): InjurySeverityLevel {
  const c = (code ?? "").trim().toUpperCase();
  const d = (description ?? "").trim().toLowerCase();

  if (c === "D60") return 3;
  if (c === "D7" || c === "D10" || c === "D15") return 2;

  const sparseCodeSev = c ? severityFromSparseRosterCodeOnly(c) : undefined;
  if (sparseCodeSev !== undefined) return sparseCodeSev;

  if (!d || d === "active") return 0;

  if (
    /\b60[-\s]?day\b/.test(d) ||
    /\bil\s*60\b/.test(d) ||
    /\b60\s*day\s*(injured|il)\b/.test(d) ||
    /\blong[-\s]?term\b/.test(d) ||
    /\bseason[-\s]?ending\b/.test(d) ||
    /\b(out|undergoing)\s+for\s+the\s+season\b/.test(d) ||
    /\btommy\s+john\b/.test(d)
  ) {
    return 3;
  }

  if (
    /\b7[-\s]?day\b/.test(d) ||
    /\b10[-\s]?day\b/.test(d) ||
    /\b15[-\s]?day\b/.test(d) ||
    /\binjured\s+list\b/.test(d) ||
    /\bdisabled\s+list\b/.test(d) ||
    /(^|\s)il(\s|$)/.test(d) ||
    /\bil\s*stint\b/.test(d)
  ) {
    return 2;
  }

  if (
    /\bday[-\s]?to[-\s]?day\b/.test(d) ||
    /\bminor\b/.test(d) ||
    /\bquestionable\b/.test(d) ||
    /\bdoubtful\b/.test(d) ||
    /\bprobable\b/.test(d) ||
    /\bgame[-\s]?time\s+decision\b/.test(d) ||
    /\bgtd\b/.test(d) ||
    /\buncertain\b/.test(d) ||
    /\brestricted\s+list\b/.test(d) ||
    /\bbereavement\b/.test(d) ||
    /\bpaternity\b/.test(d) ||
    /\bfamily\s+medical\b/.test(d) ||
    /\bmaternity\b/.test(d) ||
    /\bsuspension\b/.test(d)
  ) {
    return 1;
  }

  return 0;
}
