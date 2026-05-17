import { MLB_TEAMS } from "../data/mlbTeams";

const NAME_TO_ABBR = new Map(
  MLB_TEAMS.map((t) => [t.name.toLowerCase(), t.abbr]),
);

/** Map fixture/API variants to display abbreviations used in the app. */
const ABBR_CANONICAL: Record<string, string> = {
  AZ: "AZ",
  ARI: "AZ",
  ATH: "ATH",
  OAK: "ATH",
  SD: "SD",
  SDP: "SD",
  SF: "SF",
  SFG: "SF",
  TB: "TB",
  TBR: "TB",
  KC: "KC",
  KCR: "KC",
  CWS: "CWS",
  CHW: "CWS",
  WSH: "WSH",
  WAS: "WSH",
};

const KNOWN_ABBRS = new Set<string>([
  ...MLB_TEAMS.map((t) => t.abbr),
  ...Object.keys(ABBR_CANONICAL),
]);

/**
 * Normalize stored `playerTeam` (abbrev, alias, or full name) for compact UI.
 * Returns null when no team is known (omit suffix rather than show blank labels).
 */
export function formatMlbTeamAbbrev(
  raw: string | null | undefined,
): string | null {
  const s = raw?.trim();
  if (!s) return null;

  const upper = s.toUpperCase();
  if (/^[A-Z]{2,4}$/.test(upper)) {
    const canon = ABBR_CANONICAL[upper] ?? upper;
    return KNOWN_ABBRS.has(canon) || KNOWN_ABBRS.has(upper) ? canon : upper;
  }

  const byName = NAME_TO_ABBR.get(s.toLowerCase());
  if (byName) return byName;

  const partial = MLB_TEAMS.find(
    (t) =>
      s.toLowerCase().includes(t.name.toLowerCase()) ||
      t.name.toLowerCase().includes(s.toLowerCase()),
  );
  return partial?.abbr ?? null;
}
