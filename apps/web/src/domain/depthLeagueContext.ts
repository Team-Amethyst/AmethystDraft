import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";
import type { DepthChartPlayerRow } from "../api/players";

/**
 * Fast O(1) lookup for determining if a depth chart player is league-relevant.
 * Matches by mlbId (primary) and normalized name (fallback).
 */
export interface DepthLeagueRelevanceLookup {
  /** Set of MLB player IDs that are in league context (catalog + roster + watchlist) */
  mlbPlayerIds: Set<number>;
  /** Set of normalized player names for fallback matching */
  normalizedNames: Set<string>;
}

/**
 * Normalize a player name for matching (lowercase, trim, single spaces).
 */
function normalizePlayerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Build a fast lookup for league-relevant players from catalog, roster, and watchlist.
 * Primary key is mlbId (number), fallback is normalized name.
 */
export function buildDepthLeagueRelevanceLookup(
  catalogPlayers: Player[] | null | undefined,
  rosterEntries: RosterEntry[] | null | undefined,
  watchlistPlayers: WatchlistPlayer[] | null | undefined,
): DepthLeagueRelevanceLookup {
  const mlbPlayerIds = new Set<number>();
  const normalizedNames = new Set<string>();

  // Add catalog players by mlbId and name
  if (catalogPlayers) {
    for (const player of catalogPlayers) {
      if (player.mlbId) {
        mlbPlayerIds.add(player.mlbId);
      }
      if (player.name) {
        normalizedNames.add(normalizePlayerName(player.name));
      }
    }
  }

  // Add roster players by externalPlayerId (if present) and inferred name
  if (rosterEntries) {
    for (const entry of rosterEntries) {
      // Roster entries have externalPlayerId which matches MLB ID
      if (entry.externalPlayerId) {
        const numId = Number(entry.externalPlayerId);
        if (!Number.isNaN(numId)) mlbPlayerIds.add(numId);
      }
      // If roster has player info with name, add normalized name
      if (entry.playerName) {
        normalizedNames.add(normalizePlayerName(entry.playerName));
      }
    }
  }

  // Add watchlist players by their IDs and names
  if (watchlistPlayers) {
    for (const player of watchlistPlayers) {
      if (player.mlbId) {
        mlbPlayerIds.add(player.mlbId);
      }
      if (player.name) {
        normalizedNames.add(normalizePlayerName(player.name));
      }
    }
  }

  return { mlbPlayerIds, normalizedNames };
}

/**
 * Check if a depth chart player row is league-relevant based on the lookup.
 * Primary match: playerId must be in mlbPlayerIds set.
 * Fallback match: normalized playerName must be in normalizedNames set.
 */
export function isDepthChartRowLeagueRelevant(
  row: DepthChartPlayerRow,
  lookup: DepthLeagueRelevanceLookup,
): boolean {
  // Primary: exact mlbId match
  if (lookup.mlbPlayerIds.has(row.playerId)) {
    return true;
  }

  // Fallback: normalized name match
  const normalizedRowName = normalizePlayerName(row.playerName);
  return lookup.normalizedNames.has(normalizedRowName);
}
