import { useMemo } from "react";
import { Search } from "lucide-react";
import type { MlbTeamOption } from "../../data/mlbTeams";
import type { DepthChartMatchSummary } from "../../domain/depthChartRowMatch";
import { formatDepthChartHeaderUpdatedLabel } from "../../domain/depthChartRowMatch";
import { ResearchViewSelectField } from "./ResearchViewSelectField";
import "../PlayerTable.css";

interface ResearchDepthChartToolbarProps {
  teams: readonly MlbTeamOption[];
  selectedTeamId: number;
  onTeamChange: (teamId: number) => void;
  onRefresh: () => void;
  generatedAt: string | null;
  rosterCount: number | null;
  rosterLimit: number | null;
  assignmentCount: number;
  assignmentCapacity: number;
  rosterLimitNote?: string | null;
  rosterLimitOk: boolean;
  matchSummary: DepthChartMatchSummary | null;
  useValuationBreakdown?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ResearchDepthChartToolbar({
  teams,
  selectedTeamId,
  onTeamChange,
  onRefresh,
  generatedAt,
  rosterCount,
  rosterLimit,
  assignmentCount,
  assignmentCapacity,
  rosterLimitOk,
  matchSummary,
  useValuationBreakdown = false,
  searchQuery,
  onSearchChange,
}: ResearchDepthChartToolbarProps) {
  const updatedShort = formatDepthChartHeaderUpdatedLabel(generatedAt);
  const rosterOverLimit =
    rosterCount != null &&
    rosterLimit != null &&
    rosterCount > rosterLimit;
  const rosterChipWarning = rosterOverLimit || !rosterLimitOk;
  const activeRosterOk = rosterLimitOk && !rosterOverLimit;

  const teamOptions = useMemo(
    () =>
      teams.map((team) => ({
        value: String(team.id),
        label: `${team.abbr} - ${team.name}`,
      })),
    [teams],
  );

  return (
    <header className="depth-chart-page-header cc-surface-inset">
      <div className="depth-chart-page-header__top">
        <div className="depth-chart-page-header__intro">
          <h2>Depth Charts</h2>
          <p>Daily active-roster depth with starter / backup / reserve rankings.</p>
        </div>
        <div className="depth-chart-page-header__controls">
          <ResearchViewSelectField
            id="depth-team-select"
            label="MLB team"
            selectClassName="research-view-select--team"
            value={String(selectedTeamId)}
            onChange={(value) => onTeamChange(Number(value))}
            options={teamOptions}
            aria-label="MLB team to show on depth chart"
          />
          <button type="button" className="depth-chart-refresh-btn" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      <div className="depth-chart-page-header__search-status-row pt-control-theme">
        <div className="pt-search depth-chart-header-search">
          <Search size={15} className="pt-search-icon" aria-hidden />
          <input
            type="text"
            className="pt-search-input"
            placeholder="Search depth chart players..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Search depth chart players"
          />
        </div>

        <div
          className="depth-chart-page-header__status-row"
          aria-label="Depth chart data status"
        >
        <span className="depth-chart-status-chip">Updated {updatedShort}</span>
        <span
          className={`depth-chart-status-chip${rosterChipWarning ? " is-warning" : ""}`}
        >
          Roster {rosterCount ?? "—"}/{rosterLimit ?? "—"}
        </span>
        <span className="depth-chart-status-chip">
          Assignments {assignmentCount}/{assignmentCapacity}
        </span>
        <span
          className={`depth-chart-status-chip${activeRosterOk ? " is-ok" : " is-warning"}`}
        >
          {activeRosterOk ? "Active roster OK" : "Over limit"}
        </span>
        {matchSummary != null && useValuationBreakdown ? (
          <>
            <span className="depth-chart-status-chip">
              {matchSummary.valued} valued
            </span>
            <span className="depth-chart-status-chip">
              {matchSummary.catalogOnly} catalog-only
            </span>
            <span className="depth-chart-status-chip">
              {matchSummary.rostered} rostered
            </span>
            <span className="depth-chart-status-chip">
              {matchSummary.depthOnly} depth-only
            </span>
            {matchSummary.unmatched > 0 ? (
              <span className="depth-chart-status-chip is-warning">
                {matchSummary.unmatched} unmatched
              </span>
            ) : null}
          </>
        ) : matchSummary != null ? (
          <>
            <span className="depth-chart-status-chip">
              {matchSummary.valuedCatalogMatches} valued
            </span>
            <span className="depth-chart-status-chip">
              {matchSummary.depthOnly} depth-only
            </span>
            {matchSummary.unmatched > 0 ? (
              <span className="depth-chart-status-chip is-warning">
                {matchSummary.unmatched} unmatched
              </span>
            ) : null}
          </>
        ) : null}
        </div>
      </div>
    </header>
  );
}
