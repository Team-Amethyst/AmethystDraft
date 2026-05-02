/**
 * Debug utility to identify why depth chart players aren't matching catalog players.
 * Use this to diagnose data synchronization issues between MLB Stats API and internal catalog.
 */

import type { Player } from "../types/player";
import type { DepthChartPlayerRow, DepthChartResponse } from "../api/players";
import type { RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";

export interface DepthMatchDiagnostics {
  unmatchedDepthPlayers: Array<{
    depth: DepthChartPlayerRow;
    position: string;
    matchType: "mlbId_match" | "name_match" | "no_match";
    catalogMatch?: Player;
    rosterMatch?: RosterEntry;
    watchlistMatch?: WatchlistPlayer;
    diagnostics: {
      mlbIdUsed?: number;
      nameUsed?: string;
      catalogHasMlbId?: boolean;
      catalogHasName?: boolean;
      rosterHasId?: boolean;
    };
  }>;
  summaryStats: {
    totalDepthPlayers: number;
    matchedByMlbId: number;
    matchedByName: number;
    unmatched: number;
    unmatchedPercentage: number;
  };
}

/**
 * Diagnose why depth chart players don't match catalog/roster/watchlist.
 * Returns detailed info on each unmatched player for debugging.
 */
export function diagnosisDepthChartMatching(
  depthChart: DepthChartResponse,
  catalogPlayers: Player[] | null | undefined,
  rosterEntries: RosterEntry[] | null | undefined,
  watchlistPlayers: WatchlistPlayer[] | null | undefined,
): DepthMatchDiagnostics {
  const allDepthPlayers: Array<{
    row: DepthChartPlayerRow;
    position: string;
  }> = [];

  // Flatten all depth chart positions into a single list
  for (const [position, rows] of Object.entries(depthChart.positions)) {
    for (const row of rows) {
      allDepthPlayers.push({ row, position });
    }
  }

  // Build lookup maps for fast searching
  const catalogByMlbId = new Map<number, Player>();
  const catalogByName = new Map<string, Player>();
  if (catalogPlayers) {
    for (const player of catalogPlayers) {
      if (player.mlbId) catalogByMlbId.set(player.mlbId, player);
      catalogByName.set(normalizeNameForSearch(player.name), player);
    }
  }

  const rosterByExternalId = new Map<number, RosterEntry>();
  const rosterByName = new Map<string, RosterEntry>();
  if (rosterEntries) {
    for (const entry of rosterEntries) {
      if (entry.externalPlayerId) rosterByExternalId.set(entry.externalPlayerId, entry);
      if (entry.playerName) rosterByName.set(normalizeNameForSearch(entry.playerName), entry);
    }
  }

  const watchlistByMlbId = new Map<number, WatchlistPlayer>();
  const watchlistByName = new Map<string, WatchlistPlayer>();
  if (watchlistPlayers) {
    for (const player of watchlistPlayers) {
      if (player.mlbId) watchlistByMlbId.set(player.mlbId, player);
      watchlistByName.set(normalizeNameForSearch(player.name), player);
    }
  }

  const unmatchedDepthPlayers: DepthMatchDiagnostics["unmatchedDepthPlayers"] = [];
  let matchedByMlbId = 0;
  let matchedByName = 0;

  for (const { row, position } of allDepthPlayers) {
    const normalizedRowName = normalizeNameForSearch(row.playerName);

    // Try to find matches
    const catalogMatch =
      catalogByMlbId.get(row.playerId) || catalogByName.get(normalizedRowName);
    const rosterMatch =
      rosterByExternalId.get(row.playerId) || rosterByName.get(normalizedRowName);
    const watchlistMatch =
      watchlistByMlbId.get(row.playerId) || watchlistByName.get(normalizedRowName);

    // Determine match type
    let matchType: "mlbId_match" | "name_match" | "no_match" = "no_match";
    if (
      catalogByMlbId.get(row.playerId) ||
      rosterByExternalId.get(row.playerId) ||
      watchlistByMlbId.get(row.playerId)
    ) {
      matchType = "mlbId_match";
      matchedByMlbId++;
    } else if (
      catalogByName.get(normalizedRowName) ||
      rosterByName.get(normalizedRowName) ||
      watchlistByName.get(normalizedRowName)
    ) {
      matchType = "name_match";
      matchedByName++;
    }

    // If not matched, collect diagnostics
    if (matchType === "no_match") {
      unmatchedDepthPlayers.push({
        depth: row,
        position,
        matchType,
        catalogMatch,
        rosterMatch,
        watchlistMatch,
        diagnostics: {
          mlbIdUsed: row.playerId,
          nameUsed: row.playerName,
          catalogHasMlbId: catalogByMlbId.has(row.playerId),
          catalogHasName: catalogByName.has(normalizedRowName),
          rosterHasId: rosterByExternalId.has(row.playerId),
        },
      });
    }
  }

  const totalDepthPlayers = allDepthPlayers.length;
  const totalMatched = matchedByMlbId + matchedByName;
  const unmatched = totalDepthPlayers - totalMatched;

  return {
    unmatchedDepthPlayers,
    summaryStats: {
      totalDepthPlayers,
      matchedByMlbId,
      matchedByName,
      unmatched,
      unmatchedPercentage: totalDepthPlayers > 0 ? (unmatched / totalDepthPlayers) * 100 : 0,
    },
  };
}

function normalizeNameForSearch(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Format diagnostics for console logging (for debugging).
 */
export function formatDiagnosticsForConsole(diag: DepthMatchDiagnostics): string {
  const stats = diag.summaryStats;
  let output = `
Depth Chart Matching Diagnostics
================================
Total depth players: ${stats.totalDepthPlayers}
Matched by MLB ID: ${stats.matchedByMlbId}
Matched by name: ${stats.matchedByName}
UNMATCHED: ${stats.unmatched} (${stats.unmatchedPercentage.toFixed(1)}%)

Unmatched Players:
`;

  for (const unmatched of diag.unmatchedDepthPlayers) {
    output += `
  ${unmatched.position} - ${unmatched.depth.playerName} (MLB ID: ${unmatched.depth.playerId})
    Catalog has MLB ID? ${unmatched.diagnostics.catalogHasMlbId}
    Catalog has name? ${unmatched.diagnostics.catalogHasName}
    Roster has external ID? ${unmatched.diagnostics.rosterHasId}
`;
  }

  return output;
}
