import type { DepthChartPlayerRow, DepthChartResponse } from "../api/players";
import type { RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";
import type { Player } from "../types/player";
import {
  catalogPlayerMatchesExternalId,
  findCatalogPlayerByExternalId,
} from "./catalogPlayerKeys";
import type { ValuationShape } from "../utils/valuation";

/** UI badge states for depth-chart rows (source/match semantics). */
export type DepthRowMatchState =
  | "rostered"
  | "valued"
  | "catalog_only"
  | "depth_only"
  | "unmatched";

export type DepthMatchMethod =
  | "exact_mlb_id"
  | "normalized_name_and_team"
  | "normalized_name"
  | "none";

export type DepthMatchConfidence = "high" | "medium" | "low" | "none";

export type DepthRowMatchBadge = {
  state: DepthRowMatchState;
  label: string;
};

const BADGE_LABELS: Record<DepthRowMatchState, string> = {
  rostered: "Rostered",
  valued: "Valued",
  catalog_only: "Catalog only",
  depth_only: "Depth only",
  unmatched: "Unmatched",
};

export function depthRowMatchBadge(state: DepthRowMatchState): DepthRowMatchBadge {
  return { state, label: BADGE_LABELS[state] };
}

export function normalizeDepthPlayerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeTeamAbbr(team: string): string {
  return team.trim().toUpperCase();
}

export type CatalogMatchResult = {
  player?: Player;
  method: DepthMatchMethod;
  confidence: DepthMatchConfidence;
};

/**
 * Resolve catalog player for a depth row. MLB ID match always wins over name fallbacks.
 */
export function resolveCatalogMatchForDepthRow(
  catalogPlayers: readonly Player[],
  row: DepthChartPlayerRow,
  mlbTeamAbbr: string,
): CatalogMatchResult {
  const byId = findCatalogPlayerByExternalId(catalogPlayers, row.playerId);
  if (byId) {
    return { player: byId, method: "exact_mlb_id", confidence: "high" };
  }

  const normalizedRowName = normalizeDepthPlayerName(row.playerName);
  const teamNorm = normalizeTeamAbbr(mlbTeamAbbr);

  const byNameAndTeam = catalogPlayers.find((p) => {
    if (!p.name) return false;
    if (normalizeDepthPlayerName(p.name) !== normalizedRowName) return false;
    return normalizeTeamAbbr(p.team ?? "") === teamNorm;
  });
  if (byNameAndTeam) {
    return {
      player: byNameAndTeam,
      method: "normalized_name_and_team",
      confidence: "medium",
    };
  }

  const byName = catalogPlayers.find(
    (p) => p.name && normalizeDepthPlayerName(p.name) === normalizedRowName,
  );
  if (byName) {
    return { player: byName, method: "normalized_name", confidence: "low" };
  }

  return { player: undefined, method: "none", confidence: "none" };
}

/** @deprecated Use resolveCatalogMatchForDepthRow */
export function findCatalogPlayerForDepthRow(
  catalogPlayers: readonly Player[],
  row: DepthChartPlayerRow,
  mlbTeamAbbr = "",
): Player | undefined {
  return resolveCatalogMatchForDepthRow(catalogPlayers, row, mlbTeamAbbr).player;
}

export function isOnFantasyRoster(
  row: DepthChartPlayerRow,
  catalogPlayer: Player | undefined,
  rosterEntries: readonly RosterEntry[] | null | undefined,
): boolean {
  if (!rosterEntries?.length) return false;
  return rosterEntries.some((entry) => {
    if (!entry.externalPlayerId) return false;
    const ext = String(entry.externalPlayerId);
    if (ext === String(row.playerId)) return true;
    if (catalogPlayer && ext === catalogPlayer.id) return true;
    if (
      catalogPlayer?.mlbId != null &&
      ext === String(catalogPlayer.mlbId)
    ) {
      return true;
    }
    return false;
  });
}

export function playerHasEngineValuation(
  player: Player,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): boolean {
  if (valuationsByPlayerId.has(player.id)) return true;
  if (player.mlbId != null) {
    return valuationsByPlayerId.has(String(player.mlbId));
  }
  return false;
}

export function playerHasAuctionValue(
  player: Player,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): boolean {
  const row =
    valuationsByPlayerId.get(player.id) ??
    (player.mlbId != null
      ? valuationsByPlayerId.get(String(player.mlbId))
      : undefined);
  if (row?.auction_value != null && Number.isFinite(row.auction_value)) {
    return true;
  }
  return player.auction_value != null && Number.isFinite(player.auction_value);
}

export type DepthRowMatchAudit = {
  mlb: {
    name: string;
    playerId: number;
    teamAbbr: string;
    chartPosition: string;
    depthRank: 1 | 2 | 3;
  };
  app: {
    catalogPlayerId: string | null;
    catalogPlayerName: string | null;
    catalogMlbId: number | null;
    matchMethod: DepthMatchMethod;
    confidence: DepthMatchConfidence;
  };
  fantasy: {
    inResearchCatalog: boolean;
    hasValuationRow: boolean;
    hasAuctionValue: boolean;
    onFantasyRoster: boolean;
    watchlistSupported: boolean;
  };
};

export type DepthRowMatchResolution = {
  state: DepthRowMatchState;
  catalogPlayer?: Player;
  matchMethod: DepthMatchMethod;
  confidence: DepthMatchConfidence;
  audit: DepthRowMatchAudit;
};

function hasValidMlbIdentity(row: DepthChartPlayerRow): boolean {
  return (
    typeof row.playerId === "number" &&
    Number.isFinite(row.playerId) &&
    row.playerId > 0
  );
}

export function resolveDepthRowMatch(
  row: DepthChartPlayerRow,
  chartPosition: string,
  mlbTeamAbbr: string,
  catalogPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[] | null | undefined,
  _watchlist: readonly WatchlistPlayer[] | null | undefined,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): DepthRowMatchResolution {
  const hasName = row.playerName.trim().length > 0;
  const validMlbId = hasValidMlbIdentity(row);

  const catalogMatch = resolveCatalogMatchForDepthRow(
    catalogPlayers,
    row,
    mlbTeamAbbr,
  );
  const catalogPlayer = catalogMatch.player;

  const onFantasyRoster = isOnFantasyRoster(
    row,
    catalogPlayer,
    rosterEntries,
  );
  const hasValuationRow = catalogPlayer
    ? playerHasEngineValuation(catalogPlayer, valuationsByPlayerId)
    : false;
  const hasAuctionValue = catalogPlayer
    ? playerHasAuctionValue(catalogPlayer, valuationsByPlayerId)
    : false;
  const watchlistSupported = Boolean(
    catalogPlayer?.id &&
      (catalogPlayer.mlbId == null ||
        (Number.isFinite(catalogPlayer.mlbId) && catalogPlayer.mlbId > 0)),
  );

  let state: DepthRowMatchState;
  if (!validMlbId && !hasName) {
    state = "unmatched";
  } else if (
    catalogMatch.confidence === "none" &&
    row.needsManualReview &&
    !validMlbId
  ) {
    state = "unmatched";
  } else if (!catalogPlayer) {
    state = validMlbId ? "depth_only" : "unmatched";
  } else if (onFantasyRoster) {
    state = "rostered";
  } else if (hasValuationRow) {
    state = "valued";
  } else {
    state = "catalog_only";
  }

  const audit: DepthRowMatchAudit = {
    mlb: {
      name: row.playerName,
      playerId: row.playerId,
      teamAbbr: mlbTeamAbbr,
      chartPosition,
      depthRank: row.rank,
    },
    app: {
      catalogPlayerId: catalogPlayer?.id ?? null,
      catalogPlayerName: catalogPlayer?.name ?? null,
      catalogMlbId: catalogPlayer?.mlbId ?? null,
      matchMethod: catalogMatch.method,
      confidence: catalogMatch.confidence,
    },
    fantasy: {
      inResearchCatalog: Boolean(catalogPlayer),
      hasValuationRow,
      hasAuctionValue,
      onFantasyRoster,
      watchlistSupported,
    },
  };

  return {
    state,
    catalogPlayer,
    matchMethod: catalogMatch.method,
    confidence: catalogMatch.confidence,
    audit,
  };
}

/** Stable cache key for duplicate depth appearances (same MLB id). */
export function depthRowIdentityKey(row: DepthChartPlayerRow): string {
  if (hasValidMlbIdentity(row)) return `mlb:${row.playerId}`;
  return `name:${normalizeDepthPlayerName(row.playerName)}`;
}

export function buildDepthRowResolutionCache(
  depthChart: DepthChartResponse,
  mlbTeamAbbr: string,
  catalogPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[] | null | undefined,
  watchlist: readonly WatchlistPlayer[] | null | undefined,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): Map<string, DepthRowMatchResolution> {
  const cache = new Map<string, DepthRowMatchResolution>();
  for (const [position, rows] of Object.entries(depthChart.positions)) {
    for (const row of rows) {
      const key = depthRowIdentityKey(row);
      if (cache.has(key)) continue;
      cache.set(
        key,
        resolveDepthRowMatch(
          row,
          position,
          mlbTeamAbbr,
          catalogPlayers,
          rosterEntries,
          watchlist,
          valuationsByPlayerId,
        ),
      );
    }
  }
  return cache;
}

export function getDepthRowResolution(
  cache: ReadonlyMap<string, DepthRowMatchResolution>,
  row: DepthChartPlayerRow,
  chartPosition: string,
  mlbTeamAbbr: string,
  catalogPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[] | null | undefined,
  watchlist: readonly WatchlistPlayer[] | null | undefined,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): DepthRowMatchResolution {
  const key = depthRowIdentityKey(row);
  return (
    cache.get(key) ??
    resolveDepthRowMatch(
      row,
      chartPosition,
      mlbTeamAbbr,
      catalogPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
    )
  );
}

/** @deprecated Prefer resolveDepthRowMatch */
export function resolveDepthRowMatchState(
  row: DepthChartPlayerRow,
  catalogPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[] | null | undefined,
  _watchlist: readonly WatchlistPlayer[] | null | undefined,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
  mlbTeamAbbr = "",
  chartPosition = "",
): DepthRowMatchState {
  return resolveDepthRowMatch(
    row,
    chartPosition,
    mlbTeamAbbr,
    catalogPlayers,
    rosterEntries,
    _watchlist,
    valuationsByPlayerId,
  ).state;
}

export function formatDepthChartUsageLine(row: DepthChartPlayerRow): string {
  const status = row.status?.trim() || "Active";
  const starts = row.usageStarts ?? 0;
  const apps = row.usageAppearances ?? 0;
  const startLabel = starts === 1 ? "1 start" : `${starts} starts`;
  const appLabel = apps === 1 ? "1 app" : `${apps} apps`;
  return `${status} · ${startLabel} · ${appLabel}`;
}

export type DepthChartMatchSummary = {
  totalRows: number;
  valuedCatalogMatches: number;
  depthOnly: number;
  unmatched: number;
  rostered: number;
  valued: number;
  catalogOnly: number;
};

export function computeDepthChartMatchSummary(
  depthChart: DepthChartResponse,
  mlbTeamAbbr: string,
  catalogPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[] | null | undefined,
  watchlist: readonly WatchlistPlayer[] | null | undefined,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): DepthChartMatchSummary {
  let totalRows = 0;
  let valuedCatalogMatches = 0;
  let depthOnly = 0;
  let unmatched = 0;
  let rostered = 0;
  let valued = 0;
  let catalogOnly = 0;

  for (const [position, rows] of Object.entries(depthChart.positions)) {
    for (const row of rows) {
      totalRows++;
      const { state } = resolveDepthRowMatch(
        row,
        position,
        mlbTeamAbbr,
        catalogPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      );
      switch (state) {
        case "unmatched":
          unmatched++;
          break;
        case "depth_only":
          depthOnly++;
          break;
        case "rostered":
          rostered++;
          valuedCatalogMatches++;
          break;
        case "valued":
          valued++;
          valuedCatalogMatches++;
          break;
        case "catalog_only":
          catalogOnly++;
          valuedCatalogMatches++;
          break;
        default:
          break;
      }
    }
  }

  return {
    totalRows,
    valuedCatalogMatches,
    depthOnly,
    unmatched,
    rostered,
    valued,
    catalogOnly,
  };
}

export function formatDepthChartMatchSummaryLine(
  summary: DepthChartMatchSummary,
): string {
  return `${summary.totalRows} assignments · ${summary.valuedCatalogMatches} valued/catalog matches · ${summary.depthOnly} depth-only · ${summary.unmatched} unmatched`;
}

export function depthRowMatchesSearch(
  row: DepthChartPlayerRow,
  chartPosition: string,
  teamAbbr: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.playerName,
    row.primaryPosition,
    chartPosition,
    teamAbbr,
    row.status,
    String(row.playerId),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function isDepthRowWatchlistActionable(
  resolution: DepthRowMatchResolution,
): boolean {
  return resolution.audit.fantasy.watchlistSupported;
}

export function depthRowOpensNormalPlayerModal(
  state: DepthRowMatchState,
): boolean {
  return state === "rostered" || state === "valued";
}

export function depthRowOpensCatalogOnlyModal(
  state: DepthRowMatchState,
): boolean {
  return state === "catalog_only";
}

export function depthRowOpensDepthOnlyModal(state: DepthRowMatchState): boolean {
  return state === "depth_only";
}

export function depthRowOpensUnmatchedModal(state: DepthRowMatchState): boolean {
  return state === "unmatched";
}

export { catalogPlayerMatchesExternalId };
