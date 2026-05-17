import type { RosterEntry } from "../../api/roster";
import { filterActiveAuctionEntries } from "./roster";
import type { Player } from "../../types/player";
import {
  catalogPlayerIdInStringSet,
  catalogPlayerMatchesExternalId,
  findCatalogPlayerByExternalId,
} from "../../domain/catalogPlayerKeys";
import { normalizeCatName } from "./categories";
import {
  buildPlayerMapForStandings,
  buildProjectedStandings,
  computeRanks,
  getProjStat,
  type ProjectedStandingsRow,
  rotoCategoryAggregation,
  teamBattingRatePaceForCategory,
  teamPitchingRatePaceForCategory,
} from "./standings";

export interface AuctionCenterCategoryImpactRow {
  name: string;
  teamPaceStr: string;
  withPlayerStr: string;
  /**
   * Counting categories: projected add from this player (e.g. "+28").
   * Rate categories: null (player rate is in the headline stat above).
   */
  playerContributionStr: string | null;
  /** Team stat before → after (rate precision shows tiny moves). */
  teamMovementLine: string;
  /** How this pickup moves the team in this stat (separate from roto points). */
  categoryEffectLabel: string;
  /** Roto scoring change for your team in this category (+0 is still a stat story). */
  rotoPtsLine: string | null;
  /** @deprecated Prefer {@link categoryEffectLabel} / {@link playerContributionStr}. */
  deltaStr: string;
  improved: boolean;
  neutral: boolean;
}

export interface AuctionCenterCategoryImpactContext {
  leagueTeamNames: string[];
  fullRosterEntries: RosterEntry[];
  myTeamId: string;
  myTeamName: string;
  draftedIds: ReadonlySet<string>;
  leagueId: string;
  userId: string;
}

/** Roto point change only — never implies the category stat was unchanged. */
export function formatCategoryRotoPointsMessage(delta: number): string {
  if (delta === 0) return "+0 roto pts";
  if (delta > 0) return `+${delta} roto pt${delta === 1 ? "" : "s"}`;
  const d = Math.abs(delta);
  return `−${d} roto pt${d === 1 ? "" : "s"}`;
}

const RATE_EQUAL_EPS = 1e-9;

/** AVG / OBP / SLG headline: 3 decimals; extra digit when rounding hides a move. */
export function formatRateMovementStrings(
  before: number,
  after: number,
  kind: "avg" | "lower_rate",
): { beforeStr: string; afterStr: string } {
  const d = kind === "avg" ? 3 : 2;
  let bs = before.toFixed(d);
  let as = after.toFixed(d);
  if (bs === as && Math.abs(before - after) > RATE_EQUAL_EPS) {
    const d2 = kind === "avg" ? 4 : 3;
    return { beforeStr: before.toFixed(d2), afterStr: after.toFixed(d2) };
  }
  return { beforeStr: bs, afterStr: as };
}

function rateMovementKind(
  catKey: string,
  catType: "batting" | "pitching",
): "avg" | "lower_rate" {
  const n = normalizeCatName(catKey).trim().toUpperCase();
  if (catType === "pitching") return "lower_rate";
  if (n === "OBP" || n === "SLG" || n === "AVG") return "avg";
  return "avg";
}

export function categoryEffectForLowerRate(
  before: number,
  after: number,
): { label: string; improved: boolean; neutral: boolean } {
  const diff = after - before;
  if (Math.abs(diff) <= RATE_EQUAL_EPS) {
    return { label: "Unchanged", improved: false, neutral: true };
  }
  if (diff < 0) return { label: "Improves", improved: true, neutral: false };
  return { label: "Worsens", improved: false, neutral: false };
}

export function categoryEffectForHigherRate(
  before: number,
  after: number,
): { label: string; improved: boolean; neutral: boolean } {
  const diff = after - before;
  if (Math.abs(diff) <= RATE_EQUAL_EPS) {
    return { label: "Unchanged", improved: false, neutral: true };
  }
  if (diff > 0) return { label: "Improves", improved: true, neutral: false };
  return { label: "Worsens", improved: false, neutral: false };
}

export function categoryEffectForSumCategory(
  teamBeforeRounded: number,
  teamAfterRounded: number,
  playerContributionRounded: number,
): { label: string; improved: boolean; neutral: boolean } {
  if (playerContributionRounded === 0) {
    return { label: "No projected change", improved: false, neutral: true };
  }
  if (teamAfterRounded > teamBeforeRounded) {
    return { label: "Improves", improved: true, neutral: false };
  }
  if (teamAfterRounded < teamBeforeRounded) {
    return { label: "Worsens", improved: false, neutral: false };
  }
  return { label: "Unchanged", improved: false, neutral: true };
}

export function rotoPointsDeltaForTeamInCategory(
  base: ProjectedStandingsRow[],
  withP: ProjectedStandingsRow[],
  myTeamName: string,
  catStatsKey: string,
  numTeams: number,
): number | null {
  if (!myTeamName.trim() || numTeams < 2) return null;
  const ranksBefore = computeRanks(base, catStatsKey);
  const ranksAfter = computeRanks(withP, catStatsKey);
  const rb = ranksBefore.get(myTeamName);
  const ra = ranksAfter.get(myTeamName);
  if (rb == null || ra == null) return null;
  const ptsB = rotoPointsForRank(rb, numTeams);
  const ptsA = rotoPointsForRank(ra, numTeams);
  return ptsA - ptsB;
}

function rotoPointsForRank(rank: number, numTeams: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 1;
  return Math.max(1, numTeams - rank + 1);
}

function syntheticHypotheticalEntry(
  leagueId: string,
  userId: string,
  teamId: string,
  player: Player,
): RosterEntry {
  return {
    _id: `__cat_impact__:${player.id}`,
    leagueId,
    userId,
    teamId,
    externalPlayerId: player.id,
    playerName: player.name,
    playerTeam: player.team,
    positions: player.positions?.length ? player.positions : [player.position],
    price: 0,
    rosterSlot: "BN",
    isKeeper: false,
    acquiredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function formatTeamMovementLine(beforeStr: string, afterStr: string): string {
  return `${beforeStr} → ${afterStr}`;
}

export function auctionCenterCategoryImpactRows(input: {
  selectedPlayer: Player | null;
  scoringCategories: { name: string; type: "batting" | "pitching" }[] | undefined;
  statView: "hitting" | "pitching";
  myTeamEntries: RosterEntry[];
  allPlayers: Player[];
  rosterImpact?: AuctionCenterCategoryImpactContext | null;
}): AuctionCenterCategoryImpactRow[] {
  const {
    selectedPlayer,
    scoringCategories,
    statView,
    myTeamEntries: myTeamEntriesRaw,
    allPlayers,
    rosterImpact,
  } = input;

  if (!selectedPlayer || !scoringCategories?.length) return [];

  const myTeamEntries = filterActiveAuctionEntries(myTeamEntriesRaw);
  const fullRosterActive = rosterImpact
    ? filterActiveAuctionEntries(rosterImpact.fullRosterEntries)
    : [];

  const catInputs = scoringCategories
    .filter((c) =>
      statView === "pitching" ? c.type === "pitching" : c.type === "batting",
    )
    .map((c) => ({
      displayName: c.name,
      statsKey: normalizeCatName(c.name),
      type: c.type,
    }));

  const categoriesForStandings = catInputs.map((c) => ({
    name: c.statsKey,
    type: c.type,
  }));

  const myTeamPlayers = myTeamEntries
    .map((e) => findCatalogPlayerByExternalId(allPlayers, e.externalPlayerId))
    .filter((p): p is Player => !!p);

  const relevantCats = catInputs;

  let baseStandings = null as ReturnType<typeof buildProjectedStandings> | null;
  let withPlayerStandings = null as ReturnType<typeof buildProjectedStandings> | null;
  const numTeams = rosterImpact?.leagueTeamNames.length ?? 0;

  const canSimRoto =
    rosterImpact != null &&
    rosterImpact.myTeamName.trim() !== "" &&
    numTeams >= 2 &&
    !catalogPlayerIdInStringSet(rosterImpact.draftedIds, selectedPlayer) &&
    !myTeamEntries.some((e) =>
      catalogPlayerMatchesExternalId(selectedPlayer, e.externalPlayerId),
    );

  if (canSimRoto && rosterImpact) {
    const playerMap = buildPlayerMapForStandings(allPlayers);
    baseStandings = buildProjectedStandings(
      rosterImpact.leagueTeamNames,
      fullRosterActive,
      playerMap,
      categoriesForStandings,
    );
    const hypo = [
      ...fullRosterActive,
      syntheticHypotheticalEntry(
        rosterImpact.leagueId,
        rosterImpact.userId,
        rosterImpact.myTeamId,
        selectedPlayer,
      ),
    ];
    withPlayerStandings = buildProjectedStandings(
      rosterImpact.leagueTeamNames,
      hypo,
      playerMap,
      categoriesForStandings,
    );
  }

  return relevantCats.map((cat) => {
    const agg = rotoCategoryAggregation(cat.statsKey, cat.type);

    if (agg === "lower") {
      const teamPace = teamPitchingRatePaceForCategory(myTeamPlayers, cat.statsKey);
      const newTeamAvg = teamPitchingRatePaceForCategory(
        [...myTeamPlayers, selectedPlayer],
        cat.statsKey,
      );
      if (teamPace === 0 && newTeamAvg === 0) {
        const z = "0.00";
        return {
          name: cat.displayName,
          teamPaceStr: z,
          withPlayerStr: z,
          playerContributionStr: null,
          categoryEffectLabel: "No projected change",
          teamMovementLine: formatTeamMovementLine(z, z),
          rotoPtsLine: rotoDeltaLine(
            baseStandings,
            withPlayerStandings,
            rosterImpact?.myTeamName,
            cat.statsKey,
            numTeams,
          ),
          deltaStr: "No projected change",
          improved: false,
          neutral: true,
        };
      }
      const rmKind = rateMovementKind(cat.statsKey, cat.type);
      const { beforeStr: bStr, afterStr: aStr } = formatRateMovementStrings(
        teamPace,
        newTeamAvg,
        rmKind,
      );
      const { label: categoryEffectLabel, improved, neutral } =
        categoryEffectForLowerRate(teamPace, newTeamAvg);
      return {
        name: cat.displayName,
        teamPaceStr: bStr,
        withPlayerStr: aStr,
        playerContributionStr: null,
        categoryEffectLabel,
        teamMovementLine: formatTeamMovementLine(bStr, aStr),
        rotoPtsLine: rotoDeltaLine(
          baseStandings,
          withPlayerStandings,
          rosterImpact?.myTeamName,
          cat.statsKey,
          numTeams,
        ),
        deltaStr: categoryEffectLabel,
        improved,
        neutral,
      };
    }

    if (agg === "higher") {
      const teamPace = teamBattingRatePaceForCategory(myTeamPlayers, cat.statsKey);
      const newTeamAvg = teamBattingRatePaceForCategory(
        [...myTeamPlayers, selectedPlayer],
        cat.statsKey,
      );
      if (teamPace === 0 && newTeamAvg === 0) {
        const z = "0.000";
        return {
          name: cat.displayName,
          teamPaceStr: z,
          withPlayerStr: z,
          playerContributionStr: null,
          categoryEffectLabel: "No projected change",
          teamMovementLine: formatTeamMovementLine(z, z),
          rotoPtsLine: rotoDeltaLine(
            baseStandings,
            withPlayerStandings,
            rosterImpact?.myTeamName,
            cat.statsKey,
            numTeams,
          ),
          deltaStr: "No projected change",
          improved: false,
          neutral: true,
        };
      }
      const rmKind = rateMovementKind(cat.statsKey, cat.type);
      const { beforeStr: bStr, afterStr: aStr } = formatRateMovementStrings(
        teamPace,
        newTeamAvg,
        rmKind,
      );
      const { label: categoryEffectLabel, improved, neutral } =
        categoryEffectForHigherRate(teamPace, newTeamAvg);
      return {
        name: cat.displayName,
        teamPaceStr: bStr,
        withPlayerStr: aStr,
        playerContributionStr: null,
        categoryEffectLabel,
        teamMovementLine: formatTeamMovementLine(bStr, aStr),
        rotoPtsLine: rotoDeltaLine(
          baseStandings,
          withPlayerStandings,
          rosterImpact?.myTeamName,
          cat.statsKey,
          numTeams,
        ),
        deltaStr: categoryEffectLabel,
        improved,
        neutral,
      };
    }

    const teamPace = myTeamPlayers.reduce(
      (sum, p) => sum + getProjStat(p, cat.statsKey, cat.type),
      0,
    );
    const playerStat = getProjStat(selectedPlayer, cat.statsKey, cat.type);
    const roundedDelta = Math.round(playerStat);
    const withTotal = teamPace + playerStat;
    const bStr = Math.round(teamPace).toString();
    const aStr = Math.round(withTotal).toString();
    const { label: categoryEffectLabel, improved, neutral } =
      categoryEffectForSumCategory(
        Math.round(teamPace),
        Math.round(withTotal),
        roundedDelta,
      );
    const playerContributionStr =
      roundedDelta === 0
        ? null
        : roundedDelta > 0
          ? `+${roundedDelta}`
          : String(roundedDelta);
    return {
      name: cat.displayName,
      teamPaceStr: bStr,
      withPlayerStr: aStr,
      playerContributionStr,
      categoryEffectLabel,
      teamMovementLine: formatTeamMovementLine(bStr, aStr),
      rotoPtsLine: rotoDeltaLine(
        baseStandings,
        withPlayerStandings,
        rosterImpact?.myTeamName,
        cat.statsKey,
        numTeams,
      ),
      deltaStr:
        roundedDelta === 0
          ? "No projected change"
          : roundedDelta > 0
            ? `+${roundedDelta}`
            : String(roundedDelta),
      improved,
      neutral,
    };
  });
}

function rotoDeltaLine(
  base: ReturnType<typeof buildProjectedStandings> | null,
  withP: ReturnType<typeof buildProjectedStandings> | null,
  myTeamName: string | undefined,
  catName: string,
  numTeams: number,
): string | null {
  if (!base || !withP || !myTeamName?.trim() || numTeams < 2) return null;
  const d = rotoPointsDeltaForTeamInCategory(
    base,
    withP,
    myTeamName,
    catName,
    numTeams,
  );
  if (d == null) return null;
  return formatCategoryRotoPointsMessage(d);
}
