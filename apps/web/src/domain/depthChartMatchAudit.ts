import type { DepthChartResponse } from "../api/players";
import type { RosterEntry } from "../api/roster";
import type { WatchlistPlayer } from "../api/watchlist";
import type { Player } from "../types/player";
import type { ValuationShape } from "../utils/valuation";
import {
  buildDepthRowResolutionCache,
  computeDepthChartMatchSummary,
  formatDepthChartMatchSummaryLine,
  getDepthRowResolution,
  type DepthRowMatchResolution,
} from "./depthChartRowMatch";

export type DepthChartAuditRow = {
  position: string;
  resolution: DepthRowMatchResolution;
};

export type DepthChartTeamAudit = {
  teamAbbr: string;
  summaryLine: string;
  summary: ReturnType<typeof computeDepthChartMatchSummary>;
  rows: DepthChartAuditRow[];
  examplesByState: Partial<
    Record<DepthRowMatchResolution["state"], DepthChartAuditRow[]>
  >;
};

export function auditDepthChartTeam(
  depthChart: DepthChartResponse,
  mlbTeamAbbr: string,
  catalogPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[] | null | undefined,
  watchlist: readonly WatchlistPlayer[] | null | undefined,
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): DepthChartTeamAudit {
  const cache = buildDepthRowResolutionCache(
    depthChart,
    mlbTeamAbbr,
    catalogPlayers,
    rosterEntries,
    watchlist,
    valuationsByPlayerId,
  );

  const rows: DepthChartAuditRow[] = [];
  for (const [position, positionRows] of Object.entries(depthChart.positions)) {
    for (const row of positionRows) {
      const resolution = getDepthRowResolution(
        cache,
        row,
        position,
        mlbTeamAbbr,
        catalogPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      );
      rows.push({ position, resolution });
    }
  }

  const summary = computeDepthChartMatchSummary(
    depthChart,
    mlbTeamAbbr,
    catalogPlayers,
    rosterEntries,
    watchlist,
    valuationsByPlayerId,
  );

  const examplesByState: DepthChartTeamAudit["examplesByState"] = {};
  for (const entry of rows) {
    const state = entry.resolution.state;
    if (!examplesByState[state]) examplesByState[state] = [];
    if ((examplesByState[state]?.length ?? 0) < 3) {
      examplesByState[state]!.push(entry);
    }
  }

  return {
    teamAbbr: mlbTeamAbbr,
    summaryLine: formatDepthChartMatchSummaryLine(summary),
    summary,
    rows,
    examplesByState,
  };
}

export function formatDepthChartAuditForConsole(
  audit: DepthChartTeamAudit,
): string {
  const lines: string[] = [
    `Depth Chart Match Audit — ${audit.teamAbbr}`,
    audit.summaryLine,
    "",
  ];

  for (const { position, resolution } of audit.rows) {
    const { mlb, app, fantasy } = resolution.audit;
    lines.push(
      `${position} #${mlb.depthRank} ${mlb.name} (MLB ${mlb.playerId}) → ${resolution.state.toUpperCase()}`,
      `  match: ${app.matchMethod} (${app.confidence}) catalog=${app.catalogPlayerId ?? "—"}`,
      `  fantasy: roster=${fantasy.onFantasyRoster} valuation=${fantasy.hasValuationRow} auction=${fantasy.hasAuctionValue}`,
    );
  }

  lines.push("", "Examples by state:");
  for (const [state, examples] of Object.entries(audit.examplesByState)) {
    if (!examples?.length) continue;
    lines.push(`  ${state}:`);
    for (const ex of examples) {
      lines.push(`    - ${ex.position} ${ex.resolution.audit.mlb.name}`);
    }
  }

  return lines.join("\n");
}

export function logDepthChartAudit(audit: DepthChartTeamAudit): void {
  console.log(
    "%c📋 Depth Chart Match Audit",
    "color: #a855f7; font-weight: bold; font-size: 12px",
    audit.summaryLine,
    audit,
  );
  console.log(formatDepthChartAuditForConsole(audit));
}
