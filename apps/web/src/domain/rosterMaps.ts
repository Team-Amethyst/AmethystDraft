import type { RosterEntry } from "../api/roster";

/** Resolve fantasy team display name from `team_N` id and league team list. */
export function teamNameForRosterEntry(
  entry: RosterEntry,
  teamNames: readonly string[] | undefined,
): string {
  const idx = entry.teamId
    ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
    : -1;
  return (idx >= 0 ? teamNames?.[idx] : undefined) ?? entry.teamId ?? "";
}

/** `externalPlayerId` → owning team name (for drafted chips in research table). */
export function buildDraftedByTeamMap(
  rosterEntries: readonly RosterEntry[],
  teamNames: readonly string[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of rosterEntries) {
    const name = teamNameForRosterEntry(e, teamNames);
    if (name) map.set(e.externalPlayerId, name);
  }
  return map;
}

/** `externalPlayerId` → keeper contract label when present. */
export function buildKeeperContractByPlayerMap(
  rosterEntries: readonly RosterEntry[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of rosterEntries) {
    if (e.keeperContract && e.keeperContract.trim() !== "") {
      map.set(e.externalPlayerId, e.keeperContract.trim());
    }
  }
  return map;
}
