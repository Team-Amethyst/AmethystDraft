import { useMemo, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import { formatStatCell, isStatCellEmpty, rankColor } from "../../pages/commandCenterUtils";
import { useProjectedStandings } from "../../pages/useProjectedStandings";

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

export function CommandCenterMyTeamStandingsSection({
  league,
  rosterEntries,
  allPlayers,
  myTeamName,
  fallbackScoringCategories,
}: {
  league: League | null;
  rosterEntries: RosterEntry[];
  allPlayers: Player[];
  myTeamName: string;
  fallbackScoringCategories: ScoringCategory[];
}) {
  const [standingsSide, setStandingsSide] = useState<"hitting" | "pitching">(
    "hitting",
  );

  const { scoringCats, projectedStandings, rankMaps } = useProjectedStandings({
    leagueTeamNames: league?.teamNames,
    leagueScoringCategories: league?.scoringCategories,
    fallbackScoringCategories,
    rosterEntries,
    allPlayers,
  });

  const myRow = useMemo(
    () => projectedStandings.find((r) => r.teamName === myTeamName),
    [projectedStandings, myTeamName],
  );

  const nTeams = projectedStandings.length;

  const catsForSide = useMemo(
    () =>
      scoringCats.filter((c) =>
        standingsSide === "hitting"
          ? c.type === "batting"
          : c.type === "pitching",
      ),
    [scoringCats, standingsSide],
  );

  if (!league) return null;

  return (
    <section
      className="cc-surface-card cc-surface-card--left cc-my-standings-card"
      aria-label="Your projected category values and league ranks"
    >
      <div className="pac-snapshot-header cc-my-standings-head">
        <span className="market-section-label">YOUR STANDINGS</span>
        <div
          className="stat-view-toggle"
          role="tablist"
          aria-label="Hitting or pitching categories"
        >
          <button
            type="button"
            role="tab"
            aria-selected={standingsSide === "hitting"}
            className={"svt-btn " + (standingsSide === "hitting" ? "active" : "")}
            onClick={() => setStandingsSide("hitting")}
          >
            Hitting
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={standingsSide === "pitching"}
            className={
              "svt-btn " + (standingsSide === "pitching" ? "active" : "")
            }
            onClick={() => setStandingsSide("pitching")}
          >
            Pitching
          </button>
        </div>
      </div>
      {!myTeamName ? (
        <p className="cc-my-standings-empty dim">
          {`Open this league while signed in as a member to see your team's ranks here.`}
        </p>
      ) : !myRow ? (
        <p className="cc-my-standings-empty dim">
          Could not match your team to projected standings (check team name and
          roster picks).
        </p>
      ) : catsForSide.length === 0 ? (
        <p className="cc-my-standings-empty dim">
          {`No ${
            standingsSide === "hitting" ? "hitting" : "pitching"
          } categories in this league's scoring.`}
        </p>
      ) : (
        <div className="cc-my-standings-grid">
          {catsForSide.map((c) => {
            const val = myRow.stats[c.name] ?? 0;
            const rank =
              rankMaps[c.name]?.get(myTeamName) ?? (nTeams > 0 ? nTeams : 1);
            const empty = isStatCellEmpty(val);
            const rk = empty ? "" : rankColor(rank, Math.max(nTeams, 1));
            return (
              <div key={c.name} className="cc-my-standings-cell">
                <div className="cc-my-standings-cell-cat">{c.name}</div>
                <div
                  className={
                    "cc-my-standings-cell-val " +
                    rk +
                    (empty ? " cc-my-standings-cell-val--empty" : "")
                  }
                >
                  <span className="cc-my-standings-cell-num">
                    {formatStatCell(c.name, val)}
                  </span>
                  <sub className="cc-my-standings-cell-rank">#{rank}</sub>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
