import type { RosterEntry } from "../api/roster";
import type { Player } from "../types/player";

export type PlayerDraftState = {
  isDrafted: boolean;
  teamName?: string;
  paid?: number;
  contract?: string;
  displayLabel: string;
  title: string;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pushKey(keys: string[], value: unknown) {
  if (value === undefined || value === null) return;

  const text = String(value).trim();

  if (!text) return;
  if (!keys.includes(text)) keys.push(text);
}

export function playerDraftKeyCandidates(player: Player | null | undefined): string[] {
  if (!player) return [];

  const record = recordOf(player);
  const keys: string[] = [];

  pushKey(keys, player.id);
  pushKey(keys, player.mlbId);
  pushKey(keys, record.mlb_id);
  pushKey(keys, record.playerId);
  pushKey(keys, record.player_id);
  pushKey(keys, record.externalPlayerId);

  const numericMlbId =
    finiteNumber(player.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId) ??
    finiteNumber(record.player_id);

  if (numericMlbId !== null) {
    pushKey(keys, Math.round(numericMlbId));
  }

  return keys;
}

export function draftSetHasPlayer(
  draftedIds: ReadonlySet<string> | null | undefined,
  player: Player | null | undefined,
): boolean {
  if (!draftedIds || !player) return false;

  for (const key of playerDraftKeyCandidates(player)) {
    if (draftedIds.has(key)) {
      return true;
    }
  }

  return false;
}

export function lookupDraftMapForPlayer<T>(
  map: ReadonlyMap<string, T> | null | undefined,
  player: Player | null | undefined,
): T | undefined {
  if (!map || !player) return undefined;

  for (const key of playerDraftKeyCandidates(player)) {
    const value = map.get(key);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function parseDraftedPriceFromContract(contract: string | undefined): number | undefined {
  if (!contract?.trim()) return undefined;

  const match = contract.match(/\$\s*(\d+(?:\.\d+)?)/);

  if (!match) return undefined;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolvePlayerDraftState(args: {
  player: Player | null | undefined;
  draftedIds?: ReadonlySet<string> | null;
  draftedByTeam?: ReadonlyMap<string, string> | null;
  draftedPriceByPlayerId?: ReadonlyMap<string, number> | null;
  draftedContractByPlayerId?: ReadonlyMap<string, string> | null;
}): PlayerDraftState {
  const {
    player,
    draftedIds,
    draftedByTeam,
    draftedPriceByPlayerId,
    draftedContractByPlayerId,
  } = args;

  if (!player || !draftSetHasPlayer(draftedIds, player)) {
    return {
      isDrafted: false,
      displayLabel: "Available",
      title: "Available in the current draft room",
    };
  }

  const teamName = lookupDraftMapForPlayer(draftedByTeam, player)?.trim() || "Drafted";
  const contract = lookupDraftMapForPlayer(draftedContractByPlayerId, player);
  const mapPrice = lookupDraftMapForPlayer(draftedPriceByPlayerId, player);
  const paid =
    typeof mapPrice === "number" && Number.isFinite(mapPrice)
      ? mapPrice
      : parseDraftedPriceFromContract(contract);
  const roundedPaid = paid !== undefined ? Math.round(paid) : undefined;
  const priceLabel = roundedPaid !== undefined ? ` · $${roundedPaid}` : "";

  return {
    isDrafted: true,
    teamName,
    paid,
    contract,
    displayLabel: `${teamName}${priceLabel}`,
    title:
      roundedPaid !== undefined
        ? `Drafted by ${teamName} for $${roundedPaid} (historical sale, not live valuation)`
        : `Drafted by ${teamName}`,
  };
}

export function buildRosterDraftMaps(
  roster: readonly RosterEntry[],
  teamNames?: readonly string[],
): {
  draftedIds: Set<string>;
  draftedByTeam: Map<string, string>;
  draftedPriceByPlayerId: Map<string, number>;
  draftedContractByPlayerId: Map<string, string>;
} {
  const draftedIds = new Set<string>();
  const draftedByTeam = new Map<string, string>();
  const draftedPriceByPlayerId = new Map<string, number>();
  const draftedContractByPlayerId = new Map<string, string>();

  for (const entry of roster) {
    const key = String(entry.externalPlayerId ?? "").trim();

    if (!key) continue;

    const teamNumber = Number(String(entry.teamId).replace("team_", ""));
    const teamName =
      Number.isFinite(teamNumber) && teamNumber > 0
        ? teamNames?.[teamNumber - 1] ?? entry.teamId
        : entry.teamId;

    draftedIds.add(key);
    draftedByTeam.set(key, teamName);

    if (Number.isFinite(entry.price)) {
      draftedPriceByPlayerId.set(key, entry.price);
    }

    if (entry.keeperContract) {
      draftedContractByPlayerId.set(key, entry.keeperContract);
    }
  }

  return {
    draftedIds,
    draftedByTeam,
    draftedPriceByPlayerId,
    draftedContractByPlayerId,
  };
}
