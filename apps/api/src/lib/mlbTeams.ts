export const AL_TEAMS = new Set([
  "BAL",
  "BOS",
  "NYY",
  "TB",
  "TOR",
  "CWS",
  "CLE",
  "DET",
  "KC",
  "MIN",
  "HOU",
  "LAA",
  "OAK",
  "SEA",
  "TEX",
]);

export const NL_TEAMS = new Set([
  "ATL",
  "MIA",
  "NYM",
  "PHI",
  "WSH",
  "CHC",
  "CIN",
  "MIL",
  "PIT",
  "STL",
  "ARI",
  "COL",
  "LAD",
  "SD",
  "SF",
]);

// MLB team ID -> abbreviation (stable across seasons)
const MLB_TEAM_ABBREV: Record<number, string> = {
  108: "LAA",
  109: "ARI",
  110: "BAL",
  111: "BOS",
  112: "CHC",
  113: "CIN",
  114: "CLE",
  115: "COL",
  116: "DET",
  117: "HOU",
  118: "KC",
  119: "LAD",
  120: "WSH",
  121: "NYM",
  133: "OAK",
  134: "PIT",
  135: "SD",
  136: "SEA",
  137: "SF",
  138: "STL",
  139: "TB",
  140: "TEX",
  141: "TOR",
  142: "MIN",
  143: "PHI",
  144: "ATL",
  145: "CWS",
  146: "MIA",
  147: "NYY",
  158: "MIL",
};

export function teamAbbrev(
  split?: { id: number; abbreviation?: string },
  bio?: { id: number; abbreviation?: string },
): string {
  return (
    split?.abbreviation ??
    MLB_TEAM_ABBREV[split?.id ?? 0] ??
    bio?.abbreviation ??
    MLB_TEAM_ABBREV[bio?.id ?? 0] ??
    "--"
  );
}
