import { ChevronDown, ChevronUp } from "lucide-react";
import { formatStatCell, isStatCellEmpty, rankColor } from "../../pages/commandCenterUtils";

type ProjectedStandingRow = {
  teamName: string;
  stats: Record<string, number>;
};

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

export function CommandCenterRightStandingsTable({
  scoringCats,
  sortedProjStandings,
  rankMaps,
  sortCat,
  sortAsc,
  onToggleStandingsSort,
  isTeamOne,
}: {
  scoringCats: ScoringCategory[];
  sortedProjStandings: ProjectedStandingRow[];
  rankMaps: Record<string, Map<string, number>>;
  sortCat: string;
  sortAsc: boolean;
  onToggleStandingsSort: (cat: string) => void;
  isTeamOne: (name: string) => boolean;
}) {
  return (
    <div className="liquidity-table-wrap lo-standings-wrap--right">
      <div className="cc-standings-scroll">
        <div className="cc-standings-split">
          <div className="cc-standings-team-pane">
            <table
              className="lo-standings-table lo-standings-table--team-only cc-roster-data-table"
              aria-label="Teams"
            >
              <tbody>
                {sortedProjStandings.map((row, idx) => (
                  <tr
                    key={row.teamName}
                    className={[
                      idx % 2 === 0 ? "lo-tr-even" : "",
                      isTeamOne(row.teamName) ? "cc-team-one-row" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className="lo-td-team" title={row.teamName}>
                      {row.teamName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cc-standings-stats-scroll">
            <table className="lo-standings-table lo-standings-table--stats-only cc-roster-data-table">
              <thead>
                <tr>
                  {scoringCats.map((c) => (
                    <th
                      key={c.name}
                      className={"lo-th-stat" + (sortCat === c.name ? " lo-th-active" : "")}
                      onClick={() => onToggleStandingsSort(c.name)}
                    >
                      {c.name}
                      {sortCat === c.name ? (
                        sortAsc ? (
                          <ChevronUp size={10} className="lo-th-sort-chevron" aria-hidden />
                        ) : (
                          <ChevronDown
                            size={10}
                            className="lo-th-sort-chevron"
                            aria-hidden
                          />
                        )
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedProjStandings.map((row, idx) => (
                  <tr
                    key={row.teamName}
                    className={[
                      idx % 2 === 0 ? "lo-tr-even" : "",
                      isTeamOne(row.teamName) ? "cc-team-one-row" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {scoringCats.map((c) => {
                      const rank = rankMaps[c.name]?.get(row.teamName) ?? 1;
                      const val = row.stats[c.name] ?? 0;
                      const empty = isStatCellEmpty(val);
                      const colorClass = empty
                        ? ""
                        : rankColor(rank, sortedProjStandings.length);
                      return (
                        <td
                          key={c.name}
                          className={
                            "lo-td-stat" +
                            (empty
                              ? " lo-td-stat--empty"
                              : colorClass
                                ? ` ${colorClass}`
                                : "")
                          }
                        >
                          {formatStatCell(c.name, val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
