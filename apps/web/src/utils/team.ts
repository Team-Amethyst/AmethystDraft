import type { League } from "../contexts/LeagueContext";
import { resolveTeamDisplayNames } from "../domain/fantasyTeamNames";

/**
 * Display labels for UI (Mongo `league.teamNames` or letter fallback).
 * Logic/valuation/rosters always use `team_1` … `team_n` ids.
 */
export function resolvedLeagueTeamNames(
  league: League | null | undefined,
): string[] {
  if (!league) return [];
  const numTeams =
    league.teams > 0
      ? league.teams
      : (league.teamNames?.length ?? 0);
  return resolveTeamDisplayNames(
    numTeams,
    league.teamNames?.length ? league.teamNames : null,
  );
}

export function resolveUserTeamId(
  league: League | null | undefined,
  userId: string | null | undefined,
): string {
  if (!league || !userId) return "team_1";
  const idx = league.memberIds.findIndex((id) => id === userId);
  return idx >= 0 ? `team_${idx + 1}` : "team_1";
}

/** 0-based index from `team_1` … `team_n` (defaults to 0 when malformed). */
export function teamIndexFromTeamId(teamId: string): number {
  const m = /^team_(\d+)$/i.exec(String(teamId ?? "").trim());
  return m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
}

/** Display name for a stable engine roster team id. */
export function teamDisplayNameForTeamId(
  league: League | null | undefined,
  teamId: string,
): string {
  if (!league) return "";
  const names = resolvedLeagueTeamNames(league);
  const i = teamIndexFromTeamId(teamId);
  return names[i] ?? "";
}

/** Default “won by” log team = same roster row the valuation board uses for this user. */
export function defaultLogWonByTeamName(
  league: League | null | undefined,
  userTeamId: string,
): string {
  return teamDisplayNameForTeamId(league, userTeamId);
}

/** Map a league roster display name to stable `team_n` id (for “Won by” → valuation team). */
export function teamIdFromLeagueTeamName(
  league: League | null | undefined,
  teamName: string,
): string | null {
  if (!league) return null;
  const names = resolvedLeagueTeamNames(league);
  if (!names.length) return null;
  const needle = teamName.trim().toLowerCase();
  const i = names.findIndex((n) => n.trim().toLowerCase() === needle);
  return i >= 0 ? `team_${i + 1}` : null;
}
