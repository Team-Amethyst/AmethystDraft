import { useMemo } from "react";
import type { DepthChartPlayerRow, DepthChartPosition, DepthChartResponse } from "../../api/players";
import type { RosterEntry } from "../../api/roster";
import type { WatchlistPlayer } from "../../api/watchlist";
import type { Player } from "../../types/player";
import {
  RESEARCH_DEPTH_POSITIONS,
  researchDepthSlotCapacity,
} from "../../domain/researchDepthLayout";
import {
  buildDepthRowResolutionCache,
  computeDepthChartMatchSummary,
  depthRowMatchesSearch,
  getDepthRowResolution,
  isDepthRowWatchlistActionable,
  resolveDepthRowRightDisplay,
} from "../../domain/depthChartRowMatch";
import type { ValuationShape } from "../../utils/valuation";
import { ResearchDepthChartToolbar } from "./ResearchDepthChartToolbar";
import {
  DepthChartPositionCard,
  type DepthChartSlotViewModel,
} from "./DepthChartPositionCard";
import { MLB_TEAMS } from "../../data/mlbTeams";

interface DepthChartViewProps {
  depthChartData: DepthChartResponse;
  selectedTeamId: number;
  teamAbbr: string;
  catalogPlayers: readonly Player[];
  rosterEntries: readonly RosterEntry[];
  watchlist: readonly WatchlistPlayer[];
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>;
  /** League roster slot keys for catalog position badges (matches Command Center). */
  draftDisplaySlotKeys?: readonly string[];
  /** Fantasy team display names (`team_1` index order) for rostered row labels. */
  leagueTeamNames?: readonly string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onTeamChange: (teamId: number) => void;
  onRefresh: () => void;
  isInWatchlist: (playerId: string) => boolean;
  onPlayerClick: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
  onStarToggle: (row: DepthChartPlayerRow, position: DepthChartPosition) => void;
}

export function DepthChartView({
  depthChartData,
  selectedTeamId,
  teamAbbr,
  catalogPlayers,
  rosterEntries,
  watchlist,
  valuationsByPlayerId,
  draftDisplaySlotKeys,
  leagueTeamNames,
  searchQuery,
  onSearchChange,
  onTeamChange,
  onRefresh,
  isInWatchlist,
  onPlayerClick,
  onStarToggle,
}: DepthChartViewProps) {
  const assignmentCapacity = researchDepthSlotCapacity();

  const resolutionCache = useMemo(
    () =>
      buildDepthRowResolutionCache(
        depthChartData,
        teamAbbr,
        catalogPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      ),
    [
      depthChartData,
      teamAbbr,
      catalogPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
    ],
  );

  const matchSummary = useMemo(
    () =>
      computeDepthChartMatchSummary(
        depthChartData,
        teamAbbr,
        catalogPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      ),
    [
      depthChartData,
      teamAbbr,
      catalogPlayers,
      rosterEntries,
      watchlist,
      valuationsByPlayerId,
    ],
  );

  const visiblePositions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return RESEARCH_DEPTH_POSITIONS;

    return RESEARCH_DEPTH_POSITIONS.filter((position) => {
      const rows = depthChartData.positions[position] ?? [];
      return rows.some((row) =>
        depthRowMatchesSearch(row, position, teamAbbr, q),
      );
    });
  }, [depthChartData, searchQuery, teamAbbr]);

  const buildSlots = (position: DepthChartPosition): DepthChartSlotViewModel[] => {
    const rows = depthChartData.positions[position] ?? [];
    const q = searchQuery.trim();

    return ([1, 2, 3] as const).map((rank) => {
      const row = rows.find((item) => item.rank === rank) ?? null;
      if (row && q && !depthRowMatchesSearch(row, position, teamAbbr, q)) {
        return {
          rank,
          row: null,
          catalogPlayer: null,
          matchState: null,
          rightDisplay: null,
          watchlistEnabled: false,
          watchlistStarred: false,
        };
      }
      if (!row) {
        return {
          rank,
          row: null,
          catalogPlayer: null,
          matchState: null,
          rightDisplay: null,
          watchlistEnabled: false,
          watchlistStarred: false,
        };
      }

      const resolution = getDepthRowResolution(
        resolutionCache,
        row,
        position,
        teamAbbr,
        catalogPlayers,
        rosterEntries,
        watchlist,
        valuationsByPlayerId,
      );
      const catalogPlayer = resolution.catalogPlayer;
      const watchlistId = catalogPlayer?.id ?? "";

      return {
        rank,
        row,
        catalogPlayer: resolution.catalogPlayer,
        matchState: resolution.state,
        rightDisplay: resolveDepthRowRightDisplay(
          resolution,
          row,
          valuationsByPlayerId,
          rosterEntries,
          leagueTeamNames,
        ),
        watchlistEnabled: isDepthRowWatchlistActionable(resolution),
        watchlistStarred: watchlistId ? isInWatchlist(watchlistId) : false,
      };
    });
  };

  return (
    <div className="depth-chart-wrapper">
      <ResearchDepthChartToolbar
        teams={MLB_TEAMS}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        onRefresh={onRefresh}
        generatedAt={depthChartData.generatedAt}
        rosterCount={depthChartData.rosterCount}
        rosterLimit={depthChartData.rosterLimit}
        assignmentCount={matchSummary.totalRows}
        assignmentCapacity={assignmentCapacity}
        rosterLimitNote={depthChartData.constraints.note}
        rosterLimitOk={depthChartData.constraints.rosterLimitRespected}
        matchSummary={matchSummary}
        useValuationBreakdown={valuationsByPlayerId.size > 0}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />

      {visiblePositions.length === 0 ? (
        <p className="depth-chart-empty-search">No players match your search.</p>
      ) : (
        <div className="depth-chart-grid">
          {visiblePositions.map((position) => (
            <DepthChartPositionCard
              key={position}
              position={position}
              slots={buildSlots(position)}
              draftDisplaySlotKeys={draftDisplaySlotKeys}
              onPlayerClick={onPlayerClick}
              onStarToggle={onStarToggle}
            />
          ))}
        </div>
      )}

      {depthChartData.manualReview.length > 0 ? (
        <section className="depth-chart-manual-review cc-surface-inset">
          <h3>Manual Review Required</h3>
          <ul>
            {depthChartData.manualReview.map((item) => (
              <li key={`${item.playerId}-${item.requestedPosition}`}>
                {item.playerName} - {item.requestedPosition} ({item.reason})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
