import { CommandCenterRightLiquidityTable } from "./CommandCenterRightLiquidityTable";
import { CommandCenterRightStandingsTable } from "./CommandCenterRightStandingsTable";
import type { League } from "../../contexts/LeagueContext";
import type { RosterEntry } from "../../api/roster";
import type { TeamSummary } from "../../pages/commandCenterUtils";

type LiqCol = "name" | "remaining" | "open" | "maxBid" | "ppSpot";
type ScoringCategory = { name: string; type: "batting" | "pitching" };
type ProjectedStandingRow = { teamName: string; stats: Record<string, number> };

export function CommandCenterRightRosterPane({
  rightRosterPane,
  onSetRightRosterPane,
  sortedTeamData,
  liqSort,
  onToggleLiqSort,
  selectedPlayerPositions,
  league,
  rosterEntries,
  isMyTeam,
  scoringCats,
  sortedProjStandings,
  rankMaps,
  sortCat,
  sortAsc,
  onToggleStandingsSort,
}: {
  rightRosterPane: "liquidity" | "standings";
  onSetRightRosterPane: (pane: "liquidity" | "standings") => void;
  sortedTeamData: TeamSummary[];
  liqSort: { col: LiqCol; dir: "asc" | "desc" };
  onToggleLiqSort: (col: LiqCol) => void;
  selectedPlayerPositions: string[];
  league: League | null;
  rosterEntries: RosterEntry[];
  isMyTeam: (name: string) => boolean;
  scoringCats: ScoringCategory[];
  sortedProjStandings: ProjectedStandingRow[];
  rankMaps: Record<string, Map<string, number>>;
  sortCat: string;
  sortAsc: boolean;
  onToggleStandingsSort: (cat: string) => void;
}) {
  return (
    <section className="cc-surface-card cc-surface-card--right cc-right-roster-pane">
      <div className="pac-snapshot-header cc-roster-pane-head" role="presentation">
        <span className="market-section-label">
          {rightRosterPane === "liquidity" ? "LIQUIDITY" : "STANDINGS"}
        </span>
        <div className="stat-view-toggle" role="tablist" aria-label="Team liquidity or standings">
          <button
            type="button"
            role="tab"
            aria-selected={rightRosterPane === "liquidity"}
            className={"svt-btn " + (rightRosterPane === "liquidity" ? "active" : "")}
            onClick={() => onSetRightRosterPane("liquidity")}
          >
            Liquidity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightRosterPane === "standings"}
            className={"svt-btn " + (rightRosterPane === "standings" ? "active" : "")}
            onClick={() => onSetRightRosterPane("standings")}
          >
            Standings
          </button>
        </div>
      </div>
      {rightRosterPane === "liquidity" ? (
        <CommandCenterRightLiquidityTable
          sortedTeamData={sortedTeamData}
          liqSort={liqSort}
          onToggleLiqSort={onToggleLiqSort}
          selectedPlayerPositions={selectedPlayerPositions}
          league={league}
          rosterEntries={rosterEntries}
          isMyTeam={isMyTeam}
        />
      ) : (
        <CommandCenterRightStandingsTable
          scoringCats={scoringCats}
          sortedProjStandings={sortedProjStandings}
          rankMaps={rankMaps}
          sortCat={sortCat}
          sortAsc={sortAsc}
          onToggleStandingsSort={onToggleStandingsSort}
          isMyTeam={isMyTeam}
        />
      )}
    </section>
  );
}
