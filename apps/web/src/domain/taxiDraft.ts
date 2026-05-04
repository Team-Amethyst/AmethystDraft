import type { Player } from "../types/player";
import type { TaxiRosterEntry, TaxiRosters } from "../types/taxiDraft";

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
  if (oldPlayerId === newPlayerId) return taxiRosters;

  const existingPlayerIds = new Set(getTaxiRosterPlayerIds(taxiRosters));
  if (existingPlayerIds.has(newPlayerId)) {
    return taxiRosters;
  }

  const teamRoster = taxiRosters[teamId];
  if (!teamRoster) return taxiRosters;

  const index = teamRoster.findIndex((entry) => entry.playerId === oldPlayerId);
  if (index === -1) return taxiRosters;

  const updatedEntry: TaxiRosterEntry = {
    ...teamRoster[index],
    playerId: newPlayerId,
  };

  return {
    ...taxiRosters,
    [teamId]: [
      ...teamRoster.slice(0, index),
      updatedEntry,
      ...teamRoster.slice(index + 1),
    ],
  };
}
