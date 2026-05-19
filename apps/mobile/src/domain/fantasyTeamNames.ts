/** Display names for fantasy teams (aligned with api/src/lib/fantasyTeamNames.ts). */

export function defaultTeamDisplayNameForIndex(
  index: number,
  numTeams: number,
): string {
  if (numTeams > 0 && numTeams <= 26) {
    return `Team ${String.fromCharCode(65 + index)}`;
  }
  return `Team ${index + 1}`;
}

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