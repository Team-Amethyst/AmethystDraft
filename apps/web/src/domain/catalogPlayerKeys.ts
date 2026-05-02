import type { Player } from "../types/player";

/**
 * League roster rows use `externalPlayerId`. In practice that value is sometimes the
 * catalog `Player.id` and sometimes the MLB id as a string. Call sites should try both
 * when joining roster data to catalog players.
 */
export function lookupRosterMapForCatalogPlayer<T>(
  map: ReadonlyMap<string, T>,
  player: Pick<Player, "id" | "mlbId">,
): T | undefined {
  return map.get(player.id) ?? map.get(String(player.mlbId));
}

export function hasRosterMapEntryForCatalogPlayer(
  map: ReadonlyMap<string, unknown> | undefined,
  player: Pick<Player, "id" | "mlbId">,
): boolean {
  if (!map) return false;
  return map.has(player.id) || map.has(String(player.mlbId));
}

/** Drafted-id sets from roster use the same dual-key convention as maps. */
export function catalogPlayerIdInStringSet(
  set: ReadonlySet<string>,
  player: Pick<Player, "id" | "mlbId">,
): boolean {
  return set.has(player.id) || set.has(String(player.mlbId));
}

/**
 * True when a catalog player is the same identity as an external roster / depth id
 * (numeric MLB id or string catalog id).
 */
export function catalogPlayerMatchesExternalId(
  player: Pick<Player, "id" | "mlbId">,
  externalPlayerId: number | string,
): boolean {
  if (player.id === String(externalPlayerId)) return true;
  const extNum =
    typeof externalPlayerId === "number"
      ? externalPlayerId
      : Number.parseInt(String(externalPlayerId), 10);
  if (Number.isFinite(extNum) && player.mlbId === extNum) return true;
  return false;
}

export function findCatalogPlayerByExternalId<T extends Pick<Player, "id" | "mlbId">>(
  players: readonly T[],
  externalPlayerId: number | string,
): T | undefined {
  return players.find((p) => catalogPlayerMatchesExternalId(p, externalPlayerId));
}
