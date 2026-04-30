import { useMemo } from "react";
import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import {
  buildProjectedStandings,
  computeRanks,
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
    () => new Map(allPlayers.map((p) => [p.id, p])),
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

  const projectedStandings = useMemo(
    () =>
      buildProjectedStandings(
        leagueTeamNames ?? [],
        rosterEntries,
        playerMap,
        scoringCats,
      ),
    [leagueTeamNames, rosterEntries, playerMap, scoringCats],
  );

  const rankMaps = useMemo(
    () =>
      Object.fromEntries(
        scoringCats.map((c) => [c.name, computeRanks(projectedStandings, c.name)]),
      ),
    [projectedStandings, scoringCats],
  );

  return { scoringCats, projectedStandings, rankMaps };
}
