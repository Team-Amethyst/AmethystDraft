import type { RosterEntry } from "../../api/roster";
import type { Player } from "../../types/player";
import { findCatalogPlayerByExternalId } from "../../domain/catalogPlayerKeys";
import { getStatByCategory } from "./market";
import {
  rotoCategoryAggregation,
  teamBattingRatePaceForCategory,
  teamPitchingRatePaceForCategory,
} from "./standings";

export interface AuctionCenterCategoryImpactRow {
  name: string;
  teamPaceStr: string;
  withPlayerStr: string;
  deltaStr: string;
  improved: boolean;
  neutral: boolean;
}

export function auctionCenterCategoryImpactRows(input: {
  selectedPlayer: Player | null;
  scoringCategories: { name: string; type: "batting" | "pitching" }[] | undefined;
  statView: "hitting" | "pitching";
  myTeamEntries: RosterEntry[];
  allPlayers: Player[];
}): AuctionCenterCategoryImpactRow[] {
  const {
    selectedPlayer,
    scoringCategories,
    statView,
    myTeamEntries,
    allPlayers,
  } = input;

  if (!selectedPlayer || !scoringCategories?.length) return [];

  const myTeamPlayers = myTeamEntries
    .map((e) => findCatalogPlayerByExternalId(allPlayers, e.externalPlayerId))
    .filter((p): p is Player => !!p);

  const relevantCats = scoringCategories.filter((cat) =>
    statView === "pitching"
      ? cat.type === "pitching"
      : cat.type === "batting",
  );

  return relevantCats.map((cat) => {
    const agg = rotoCategoryAggregation(cat.name, cat.type);

    if (agg === "lower") {
      const teamPace = teamPitchingRatePaceForCategory(myTeamPlayers, cat.name);
      const newTeamAvg = teamPitchingRatePaceForCategory(
        [...myTeamPlayers, selectedPlayer],
        cat.name,
      );
      if (teamPace === 0 && newTeamAvg === 0) {
        return {
          name: cat.name,
          teamPaceStr: "0.00",
          withPlayerStr: "0.00",
          deltaStr: "0",
          improved: false,
          neutral: true,
        };
      }
      const delta = teamPace - newTeamAvg;
      const deltaRounded = +delta.toFixed(2);
      const neutral = Math.abs(delta) < 0.005;
      const paceStr = (n: number) =>
        n > 0 ? n.toFixed(2) : n === 0 ? "0.00" : "—";
      return {
        name: cat.name,
        teamPaceStr: paceStr(teamPace),
        withPlayerStr: paceStr(newTeamAvg),
        deltaStr: neutral
          ? "0"
          : deltaRounded > 0
            ? `+${deltaRounded.toFixed(2)}`
            : deltaRounded.toFixed(2),
        improved: !neutral && deltaRounded > 0,
        neutral,
      };
    }

    if (agg === "higher") {
      const teamPace = teamBattingRatePaceForCategory(myTeamPlayers, cat.name);
      const newTeamAvg = teamBattingRatePaceForCategory(
        [...myTeamPlayers, selectedPlayer],
        cat.name,
      );
      if (teamPace === 0 && newTeamAvg === 0) {
        return {
          name: cat.name,
          teamPaceStr: "0.000",
          withPlayerStr: "0.000",
          deltaStr: "0",
          improved: false,
          neutral: true,
        };
      }
      const delta = newTeamAvg - teamPace;
      const deltaRounded = +delta.toFixed(3);
      const neutral = Math.abs(delta) < 0.0005;
      const paceStr3 = (n: number) =>
        n > 0 ? n.toFixed(3) : n === 0 ? "0.000" : "—";
      return {
        name: cat.name,
        teamPaceStr: paceStr3(teamPace),
        withPlayerStr: paceStr3(newTeamAvg),
        deltaStr: neutral
          ? "0"
          : deltaRounded > 0
            ? `+${deltaRounded.toFixed(3)}`
            : deltaRounded.toFixed(3),
        improved: !neutral && deltaRounded > 0,
        neutral,
      };
    }

    const teamPace = myTeamEntries.reduce((sum, entry) => {
      const player = findCatalogPlayerByExternalId(
        allPlayers,
        entry.externalPlayerId,
      );
      return player
        ? sum + getStatByCategory(player, cat.name, cat.type)
        : sum;
    }, 0);
    const playerStat = getStatByCategory(
      selectedPlayer,
      cat.name,
      cat.type,
    );
    const roundedDelta = Math.round(playerStat);
    return {
      name: cat.name,
      teamPaceStr: Math.round(teamPace).toString(),
      withPlayerStr: Math.round(teamPace + playerStat).toString(),
      deltaStr:
        roundedDelta === 0
          ? "0"
          : roundedDelta > 0
            ? `+${roundedDelta}`
            : String(roundedDelta),
      improved: playerStat > 0,
      neutral: playerStat === 0,
    };
  });
}
