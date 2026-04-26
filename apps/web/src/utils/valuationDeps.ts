import type { League } from "../contexts/LeagueContext";
import type { RosterEntry } from "../api/roster";
import type { ValuationResult } from "../api/engine";

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

/** Stable JSON key for league fields that affect engine valuation context. */
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

export function valuationResultNumbersEqual(
  a: ValuationResult,
  b: ValuationResult,
): boolean {
  return (
    a.baseline_value === b.baseline_value &&
    a.adjusted_value === b.adjusted_value &&
    a.recommended_bid === b.recommended_bid &&
    a.team_adjusted_value === b.team_adjusted_value &&
    a.edge === b.edge &&
    a.tier === b.tier &&
    a.indicator === b.indicator &&
    a.adp === b.adp
  );
}

export function valuationResultStableKey(v: ValuationResult): string {
  return [
    String(v.player_id).trim(),
    v.baseline_value,
    v.adjusted_value,
    v.recommended_bid ?? "",
    v.team_adjusted_value ?? "",
    v.edge ?? "",
    v.tier,
    v.indicator,
    v.adp ?? "",
  ].join("|");
}
