/**
 * Canonical Draftroom injury severity for Engine and catalog rows.
 * Primary source: MLB 40-man roster `status.code` + `status.description`.
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
