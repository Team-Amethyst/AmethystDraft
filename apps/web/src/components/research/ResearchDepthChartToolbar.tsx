import type { MlbTeamOption } from "../../data/mlbTeams";

interface ResearchDepthChartToolbarProps {
  teams: readonly MlbTeamOption[];
  selectedTeamId: number;
  onTeamChange: (teamId: number) => void;
  onRefresh: () => void;
}

export function ResearchDepthChartToolbar({
  teams,
  selectedTeamId,
  onTeamChange,
  onRefresh,
}: ResearchDepthChartToolbarProps) {
  return (
    <div className="depth-chart-header">
      <div>
        <h2>Depth Charts</h2>
        <p>
          Daily active-roster depth with starter/backup/reserve ranking
        </p>
      </div>
      <div className="depth-chart-controls">
        <label htmlFor="depth-team-select">Team</label>
        <select
          id="depth-team-select"
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
        <button
          type="button"
          className="depth-chart-refresh-btn"
          onClick={onRefresh}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
