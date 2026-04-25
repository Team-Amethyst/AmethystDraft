import type { League } from "../contexts/LeagueContext";

export function resolveUserTeamId(
  league: League | null | undefined,
  userId: string | null | undefined,
): string {
  if (!league || !userId) return "team_1";
  const idx = league.memberIds.findIndex((id) => id === userId);
  return idx >= 0 ? `team_${idx + 1}` : "team_1";
}
