import type { MlbTeamOption } from "../../data/mlbTeams";
import type { DepthChartMatchSummary } from "../../domain/depthChartRowMatch";
import { formatDepthChartMatchSummaryLine } from "../../domain/depthChartRowMatch";

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
  rosterLimitNote: string | null;
  rosterLimitOk: boolean;
  matchSummary: DepthChartMatchSummary | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showMatchSummary?: boolean;
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
  rosterLimitNote,
  rosterLimitOk,
  matchSummary,
  searchQuery,
  onSearchChange,
  showMatchSummary = true,
}: ResearchDepthChartToolbarProps) {
  const updatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleString()
    : "—";

  return (
    <header className="depth-chart-page-header">
      <ToolbarTopRow
        teams={teams}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        onRefresh={onRefresh}
      />
      <div className="depth-chart-page-header__search-row">
        <input
          type="search"
          className="depth-chart-search-input"
          placeholder="Search depth chart players…"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Search depth chart players"
        />
        {searchQuery ? (
          <button
            type="button"
            className="depth-chart-search-clear"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="depth-chart-page-header__meta">
        <span>Updated {updatedLabel}</span>
        <span className="depth-chart-meta-sep" aria-hidden>
          ·
        </span>
        <span>
          Roster {rosterCount ?? "—"}/{rosterLimit ?? "—"}
        </span>
        <span className="depth-chart-meta-sep" aria-hidden>
          ·
        </span>
        <span>
          Assignments {assignmentCount}/{assignmentCapacity}
        </span>
        {rosterLimitNote ? (
          <>
            <span className="depth-chart-meta-sep" aria-hidden>
              ·
            </span>
            <span
              className={`depth-chart-limit-chip ${rosterLimitOk ? "is-ok" : "is-warning"}`}
            >
              {rosterLimitNote}
            </span>
          </>
        ) : null}
      </p>
      {matchSummary ? (
        <p
          className={`depth-chart-page-header__match-summary ${showMatchSummary ? "depth-chart-page-header__match-summary--debug" : ""}`}
        >
          {formatDepthChartMatchSummaryLine(matchSummary)}
        </p>
      ) : null}
    </header>
  );
}

function ToolbarTopRow({
  teams,
  selectedTeamId,
  onTeamChange,
  onRefresh,
}: {
  teams: readonly MlbTeamOption[];
  selectedTeamId: number;
  onTeamChange: (teamId: number) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="depth-chart-page-header__top">
      <div className="depth-chart-page-header__intro">
        <h2>Depth Charts</h2>
        <p>Daily active-roster depth with starter / backup / reserve rankings.</p>
      </div>
      <div className="depth-chart-page-header__controls">
        <label className="depth-chart-page-header__team-label" htmlFor="depth-team-select">
          Team
        </label>
        <select
          id="depth-team-select"
          className="app-select depth-chart-team-select"
          value={selectedTeamId}
          onChange={(event) => {
            onTeamChange(Number(event.target.value));
          }}
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.abbr} - {team.name}
            </option>
          ))}
        </select>
        <button type="button" className="depth-chart-refresh-btn" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </div>
  );
}
