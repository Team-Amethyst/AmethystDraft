/**
 * Display names for fantasy teams (workbook uses Team A–I; generic leagues use Team 1–N).
 */

/** Default labels for index `i` (0-based) when no explicit name is provided. */
export function defaultTeamDisplayNameForIndex(
  index: number,
  numTeams: number,
): string {
  if (numTeams > 0 && numTeams <= 26) {
    return `Team ${String.fromCharCode(65 + index)}`;
  }
  return `Team ${index + 1}`;
}

/** Build `numTeams` display names, preferring explicit workbook / fixture names. */
export function resolveTeamDisplayNames(
  numTeams: number,
  explicit?: readonly string[] | null,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < numTeams; i++) {
    const name = explicit?.[i]?.trim();
    out.push(
      name && name.length > 0
        ? name
        : defaultTeamDisplayNameForIndex(i, numTeams),
    );
  }
  return out;
}

/** Map `team_1` → `Team A` when index is in range. */
export function fantasyNameForTeamId(teamId: string, numTeams = 26): string {
  const m = /^team_(\d+)$/i.exec(teamId.trim());
  if (!m?.[1]) return teamId;
  const n = Number.parseInt(m[1], 10);
  if (n < 1 || n > numTeams) return teamId;
  return defaultTeamDisplayNameForIndex(n - 1, numTeams);
}
