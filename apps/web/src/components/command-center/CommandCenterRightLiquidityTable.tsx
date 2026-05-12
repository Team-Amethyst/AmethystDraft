import { ChevronDown, ChevronUp } from "lucide-react";
import type { League } from "../../contexts/LeagueContext";
import type { RosterEntry } from "../../api/roster";
import type { TeamSummary } from "../../pages/commandCenterUtils";
import { teamCanBid } from "../../pages/commandCenterUtils";

type LiqCol = "name" | "remaining" | "open" | "maxBid" | "ppSpot";

export function CommandCenterRightLiquidityTable({
  sortedTeamData,
  liqSort,
  onToggleLiqSort,
  selectedPlayerPositions,
  league,
  rosterEntries,
  isMyTeam,
}: {
  sortedTeamData: TeamSummary[];
  liqSort: { col: LiqCol; dir: "asc" | "desc" };
  onToggleLiqSort: (col: LiqCol) => void;
  selectedPlayerPositions: string[];
  league: League | null;
  rosterEntries: RosterEntry[];
  isMyTeam: (name: string) => boolean;
}) {
  return (
    <div className="liquidity-table-wrap">
      <table className="liquidity-table cc-roster-data-table">
        <thead>
          <tr>
            {(
              [
                ["name", ""],
                ["remaining", "LEFT"],
                ["open", "OPEN"],
                ["maxBid", "MAX"],
                ["ppSpot", "$/SPOT"],
              ] as [LiqCol, string][]
            ).map(([col, label]) => (
              <th
                key={col}
                className={liqSort.col === col ? "active" : ""}
                onClick={() => onToggleLiqSort(col)}
                style={{ cursor: "pointer", userSelect: "none" }}
                title={
                  col === "name"
                    ? "Sort by team name"
                    : col === "remaining"
                      ? "Sort by budget left"
                      : col === "open"
                        ? "Sort by open roster spots"
                        : col === "maxBid"
                          ? "Sort by max single bid"
                          : "Sort by dollars per open spot"
                }
              >
                <span className="liq-th-inner">
                  <span className="liq-th-label">{label}</span>
                  {liqSort.col === col ? (
                    liqSort.dir === "asc" ? (
                      <ChevronUp size={10} className="lo-th-sort-chevron" aria-hidden />
                    ) : (
                      <ChevronDown
                        size={10}
                        className="lo-th-sort-chevron"
                        aria-hidden
                      />
                    )
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTeamData.length > 0 ? (
            sortedTeamData.map((t) => {
              const ineligible =
                selectedPlayerPositions.length > 0 &&
                !!league &&
                !teamCanBid(t.name, selectedPlayerPositions, league, rosterEntries);
              return (
                <tr
                  key={t.name}
                  className={[
                    isMyTeam(t.name) ? "my-team-row cc-my-team-row" : "",
                    ineligible ? "liq-ineligible" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td className="liq-team-name-cell" title={t.name}>
                    <span className="liq-team-name-text">{t.name}</span>
                    {isMyTeam(t.name) ? (
                      <span className="cc-team-you-suffix" aria-label="your team">
                        {" "}
                        (You)
                      </span>
                    ) : null}
                  </td>
                  <td>${t.remaining}</td>
                  <td>{t.open}</td>
                  <td>${t.maxBid}</td>
                  <td>${t.ppSpot}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={5}
                className="dim"
                style={{ textAlign: "center", padding: "1rem 0" }}
              >
                {league ? "No picks logged yet" : "No league loaded"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
