import type { RosterEntry } from "../api/roster";
import type { League } from "../types/league";

/** Fingerprint of roster rows that affect league valuation (draft state). */
export function rosterValuationFingerprint(entries: RosterEntry[]): string {
  return [...entries]
    .map(
      (e) =>
        `${e._id}:${e.externalPlayerId}:${e.teamId ?? ""}:${e.price}:${e.rosterSlot ?? ""}`,
    )
    .sort()
    .join("|");
}

/** Stable key for league fields that affect engine valuation context. */
export function leagueValuationConfigKey(league: League | null): string {
  if (!league) return "";
  return JSON.stringify({
    id: league.id,
    teams: league.teams,
    budget: league.budget,
    rosterSlots: league.rosterSlots,
    scoringCategories: league.scoringCategories,
    memberIds: league.memberIds,
    posEligibilityThreshold: league.posEligibilityThreshold,
    playerPool: league.playerPool,
    teamNames: league.teamNames,
  });
}
