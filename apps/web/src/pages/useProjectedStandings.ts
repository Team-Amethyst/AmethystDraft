import { useMemo } from "react";
import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import { filterActiveAuctionEntries } from "./command-center-utils/roster";
import {
  buildProjectedStandings,
  buildPlayerMapForStandings,
  computeRanks,
  computeTeamRotoSummaries,
  normalizeCatName,
} from "./commandCenterUtils";

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

export function useProjectedStandings({
  leagueTeamNames,
  leagueScoringCategories,
  fallbackScoringCategories,
  rosterEntries,
  allPlayers,
}: {
  leagueTeamNames: string[] | undefined;
  leagueScoringCategories: ScoringCategory[] | undefined;
  fallbackScoringCategories: ScoringCategory[];
  rosterEntries: RosterEntry[];
  allPlayers: Player[];
}) {
  const playerMap = useMemo(
    () => buildPlayerMapForStandings(allPlayers),
    [allPlayers],
  );

  const scoringCats = useMemo(
    () =>
      (leagueScoringCategories?.length
        ? leagueScoringCategories
        : fallbackScoringCategories
      ).map((c) => ({ ...c, name: normalizeCatName(c.name) })),
    [leagueScoringCategories, fallbackScoringCategories],
  );

  const activeRosterEntries = useMemo(
    () => filterActiveAuctionEntries(rosterEntries),
    [rosterEntries],
  );

  const projectedStandings = useMemo(
    () =>
      buildProjectedStandings(
        leagueTeamNames ?? [],
        activeRosterEntries,
        playerMap,
        scoringCats,
      ),
    [leagueTeamNames, activeRosterEntries, playerMap, scoringCats],
  );

  const rankMaps = useMemo(
    () =>
      Object.fromEntries(
        scoringCats.map((c) => [c.name, computeRanks(projectedStandings, c.name)]),
      ),
    [projectedStandings, scoringCats],
  );

  const rotoSummaries = useMemo(
    () =>
      computeTeamRotoSummaries(
        projectedStandings.map((r) => r.teamName),
        scoringCats,
        rankMaps,
      ),
    [projectedStandings, scoringCats, rankMaps],
  );

  return { scoringCats, projectedStandings, rankMaps, rotoSummaries };
}
