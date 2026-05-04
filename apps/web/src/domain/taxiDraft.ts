import type { Player } from "../types/player";
import type { TaxiRosters } from "../types/taxiDraft";

export function initializeTaxiDraftOrder(teamIds: readonly string[]): string[] {
  return [...teamIds];
}

export function moveTaxiDraftOrderTeamUp(order: readonly string[], teamId: string): string[] {
  const index = order.indexOf(teamId);
  if (index <= 0) return [...order];

  const nextOrder = [...order];
  [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]];
  return nextOrder;
}

export function moveTaxiDraftOrderTeamDown(order: readonly string[], teamId: string): string[] {
  const index = order.indexOf(teamId);
  if (index === -1 || index === order.length - 1) return [...order];

  const nextOrder = [...order];
  [nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]];
  return nextOrder;
}

export function getTaxiRosterPlayerIds(taxiRosters: TaxiRosters): string[] {
  const ids = new Set<string>();
  for (const entries of Object.values(taxiRosters)) {
    for (const entry of entries) {
      ids.add(entry.playerId);
    }
  }
  return [...ids];
}

export function getEligibleTaxiPlayers(
  players: readonly Player[],
  draftedPlayerIds: ReadonlySet<string> | readonly string[],
  taxiRosters: TaxiRosters,
): Player[] {
  const draftedIds =
    draftedPlayerIds instanceof Set
      ? draftedPlayerIds
      : new Set(draftedPlayerIds);
  const existingTaxiIds = new Set(getTaxiRosterPlayerIds(taxiRosters));

  return players.filter(
    (player) => !draftedIds.has(player.id) && !existingTaxiIds.has(player.id),
  );
}

export function addPlayerToTaxiRoster(
  taxiRosters: TaxiRosters,
  teamId: string,
  playerId: string,
  addedAt: string,
  pickNumber?: number,
): TaxiRosters {
  const existingPlayerIds = new Set(getTaxiRosterPlayerIds(taxiRosters));
  if (existingPlayerIds.has(playerId)) {
    return taxiRosters;
  }

  return {
    ...taxiRosters,
    [teamId]: [
      ...(taxiRosters[teamId] ?? []),
      {
        playerId,
        teamId,
        addedAt,
        pickNumber,
      },
    ],
  };
}

export function removePlayerFromTaxiRoster(
  taxiRosters: TaxiRosters,
  teamId: string,
  playerId: string,
): TaxiRosters {
  const teamRoster = taxiRosters[teamId];
  if (!teamRoster) return taxiRosters;

  const nextRoster = teamRoster.filter((entry) => entry.playerId !== playerId);
  if (nextRoster.length === teamRoster.length) return taxiRosters;

  return {
    ...taxiRosters,
    [teamId]: nextRoster,
  };
}

export function replaceTaxiRosterPlayer(
  taxiRosters: TaxiRosters,
  teamId: string,
  oldPlayerId: string,
  newPlayerId: string,
): TaxiRosters {
  const teamEntries = taxiRosters[teamId];
  if (!teamEntries) return taxiRosters;

  // Check if new player already exists in any roster
  const existingTaxiIds = new Set(getTaxiRosterPlayerIds(taxiRosters));
  if (existingTaxiIds.has(newPlayerId)) return taxiRosters;

  const entryIndex = teamEntries.findIndex((entry) => entry.playerId === oldPlayerId);
  if (entryIndex === -1) return taxiRosters;

  const newEntries = [...teamEntries];
  newEntries[entryIndex] = {
    ...newEntries[entryIndex],
    playerId: newPlayerId,
  };

  return {
    ...taxiRosters,
    [teamId]: newEntries,
  };
}

export function searchEligibleTaxiPlayers(
  players: readonly Player[],
  query: string,
  draftedPlayerIds: ReadonlySet<string> | readonly string[],
  taxiRosters: TaxiRosters,
): Player[] {
  if (query.length < 1) return [];

  const q = query.toLowerCase().trim();
  const eligible = getEligibleTaxiPlayers(players, draftedPlayerIds, taxiRosters);

  return eligible.filter((player) => {
    const nameMatch = player.name.toLowerCase().includes(q);
    const teamMatch = player.team.toLowerCase().includes(q);
    const positionMatch = (player.position?.toLowerCase().includes(q) ?? false) ||
                         (player.positions?.some(pos => pos.toLowerCase().includes(q)) ?? false);

    return nameMatch || teamMatch || positionMatch;
  });
}

