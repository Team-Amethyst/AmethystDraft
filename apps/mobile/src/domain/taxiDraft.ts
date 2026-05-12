import type { Player } from "../types/player";
import type { TaxiRosters } from "../types/taxiDraft";
import { searchRankedAvailablePlayers } from "./auctionPlayerSearch";

export function initializeTaxiDraftOrder(teamIds: readonly string[]): string[] {
  return [...teamIds];
}

export function moveTaxiDraftOrderTeamUp(
  order: readonly string[],
  teamId: string,
): string[] {
  const index = order.indexOf(teamId);

  if (index <= 0) return [...order];

  const nextOrder = [...order];
  [nextOrder[index - 1], nextOrder[index]] = [
    nextOrder[index],
    nextOrder[index - 1],
  ];

  return nextOrder;
}

export function moveTaxiDraftOrderTeamDown(
  order: readonly string[],
  teamId: string,
): string[] {
  const index = order.indexOf(teamId);

  if (index === -1 || index === order.length - 1) return [...order];

  const nextOrder = [...order];
  [nextOrder[index], nextOrder[index + 1]] = [
    nextOrder[index + 1],
    nextOrder[index],
  ];

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

export function searchRankedEligibleTaxiPlayers(
  players: readonly Player[],
  query: string,
  draftedPlayerIds: ReadonlySet<string> | readonly string[],
  taxiRosters: TaxiRosters,
  options?: { limit?: number },
): Player[] {
  const limit = options?.limit ?? 12;
  const q = query.toLowerCase().trim();

  if (q.length < 1) return [];

  const eligible = getEligibleTaxiPlayers(players, draftedPlayerIds, taxiRosters);

  const ranked = searchRankedAvailablePlayers([...eligible], new Set(), query, {
    limit,
  });

  if (ranked.length > 0) return ranked;

  return eligible
    .filter((player) => {
      const teamMatch = player.team.toLowerCase().includes(q);
      const positionMatch =
        player.position.toLowerCase().includes(q) ||
        (player.positions ?? []).some((pos) => pos.toLowerCase().includes(q));

      return teamMatch || positionMatch;
    })
    .sort((a, b) => a.adp - b.adp)
    .slice(0, limit);
}