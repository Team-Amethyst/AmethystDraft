import type { League } from "../types/league";

function fallbackTeamName(index: number): string {
  return `Team ${index + 1}`;
}

export function resolvedLeagueTeamNames(
  league: League | null | undefined,
): string[] {
  if (!league) {
    return [];
  }

  const count = Math.max(league.teams ?? 0, league.teamNames?.length ?? 0);
  const names: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const configured = league.teamNames?.[i]?.trim();
    names.push(configured || fallbackTeamName(i));
  }

  return names;
}

export function resolveUserTeamId(
  league: League | null | undefined,
  userId: string | null | undefined,
): string {
  if (!league || !userId) {
    return "team_1";
  }

  const index = league.memberIds.findIndex((id) => id === userId);

  if (index < 0) {
    return "team_1";
  }

  return `team_${index + 1}`;
}

export function teamIndexFromTeamId(teamId: string): number {
  const match = /^team_(\d+)$/i.exec(String(teamId ?? "").trim());

  if (!match) {
    return 0;
  }

  return Math.max(0, Number.parseInt(match[1], 10) - 1);
}

export function teamDisplayNameForTeamId(
  league: League | null | undefined,
  teamId: string,
): string {
  const index = teamIndexFromTeamId(teamId);
  return resolvedLeagueTeamNames(league)[index] ?? fallbackTeamName(index);
}

export function teamIdFromLeagueTeamName(
  league: League | null | undefined,
  teamName: string,
): string | null {
  const names = resolvedLeagueTeamNames(league);
  const target = teamName.trim().toLowerCase();
  const index = names.findIndex((name) => name.trim().toLowerCase() === target);

  if (index < 0) {
    return null;
  }

  return `team_${index + 1}`;
}
