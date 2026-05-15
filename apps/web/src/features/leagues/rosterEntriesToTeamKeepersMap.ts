import type { RosterEntry } from "../../api/roster";
import type { TeamKeeper } from "../../types/league";

/** Keeper rows and auction-draft rows (excludes minors/taxi). */
export function isPreloadableAsKeeper(entry: RosterEntry): boolean {
  if (!entry.teamId) return false;
  if (!entry.externalPlayerId && !entry.playerName?.trim()) return false;
  const slot = (entry.rosterSlot ?? "").toUpperCase();
  if (slot.includes("MIN") || slot.includes("TAXI")) return false;
  return true;
}

/** Map API roster rows into the `useLeagueForm` team → keepers shape. */
export function rosterEntriesToTeamKeepersMap(
  entries: RosterEntry[],
  teamNames: string[],
  options?: { includeDraftedPlayers?: boolean },
): Record<string, TeamKeeper[]> {
  const result: Record<string, TeamKeeper[]> = {};
  for (const entry of entries) {
    if (options?.includeDraftedPlayers) {
      if (!isPreloadableAsKeeper(entry)) continue;
    } else if (!entry.isKeeper) {
      continue;
    }
    const idx = entry.teamId
      ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
      : -1;
    const teamName = teamNames[idx] ?? `Team ${idx + 1}`;
    if (!result[teamName]) result[teamName] = [];
    result[teamName].push({
      slot: entry.rosterSlot,
      playerName: entry.playerName,
      team: entry.playerTeam,
      cost: entry.price,
      contractType: entry.keeperContract,
      playerId: entry.externalPlayerId,
      positions: entry.positions?.length ? entry.positions : undefined,
      entryId: entry._id,
    });
  }
  return result;
}
