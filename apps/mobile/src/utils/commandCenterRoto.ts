import type { RosterEntry } from "../api/roster";
import type { Player } from "../types/player";

export type CommandCenterScoringCategory = {
  name: string;
  type?: "batting" | "pitching";
};

export type CommandCenterLeagueLike = {
  id?: string;
  teamNames?: string[];
  teams?: number;
  scoringCategories?: CommandCenterScoringCategory[];
} | null;

export type MobileTeamProjectionRow = {
  teamId: string;
  teamName: string;
  totalPoints: number;
  categoryValues: Record<string, number>;
  categoryPoints: Record<string, number>;
};

export type MobileCategoryImpactRow = {
  cat: string;
  value: number;
  before: number;
  after: number;
  points: number;
};

const LOWER_IS_BETTER_CATS = new Set(["ERA", "WHIP"]);
const ROTO_RATE_BATTING_CATEGORIES = new Set(["AVG", "OBP", "SLG"]);

const FALLBACK_HITTING_CATS: CommandCenterScoringCategory[] = [
  { name: "R", type: "batting" },
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
];

const FALLBACK_PITCHING_CATS: CommandCenterScoringCategory[] = [
  { name: "W", type: "pitching" },
  { name: "K", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
  { name: "SV", type: "pitching" },
];

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function normalizeCommandCategoryName(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const inParens = upper.match(/\(([^)]+)\)$/)?.[1];
  const base = inParens ?? upper;

  if (base === "RUNS") return "R";
  if (base === "HOME RUNS") return "HR";
  if (base === "RUNS BATTED IN") return "RBI";
  if (base === "STOLEN BASES") return "SB";
  if (base === "BATTING AVERAGE") return "AVG";
  if (base === "ON-BASE PERCENTAGE") return "OBP";
  if (base === "SLUGGING PERCENTAGE") return "SLG";
  if (base === "TOTAL BASES") return "TB";
  if (base === "HITS") return "H";
  if (base === "WALKS") return "BB";
  if (base === "WINS") return "W";
  if (base === "STRIKEOUTS") return "K";
  if (base === "SO") return "K";
  if (base === "EARNED RUN AVERAGE") return "ERA";
  if (base === "WALKS + HITS PER IP") return "WHIP";
  if (base === "W+H/IP") return "WHIP";
  if (base.includes("WHIP") && base.includes("IP")) return "WHIP";
  if (base === "SAVES") return "SV";
  if (base === "HOLDS") return "HLD";
  if (base === "COMPLETE GAMES") return "CG";
  if (base === "INNINGS PITCHED") return "IP";

  return base;
}

function inferCategoryType(name: string): "batting" | "pitching" {
  const key = normalizeCommandCategoryName(name);

  if (["W", "K", "ERA", "WHIP", "SV", "HLD", "CG", "IP"].includes(key)) {
    return "pitching";
  }

  return "batting";
}

function normalizedCategories(
  scoringCategories: CommandCenterScoringCategory[] | undefined,
): Array<{ name: string; type: "batting" | "pitching" }> {
  const source = scoringCategories?.length
    ? scoringCategories
    : [...FALLBACK_HITTING_CATS, ...FALLBACK_PITCHING_CATS];

  const result: Array<{ name: string; type: "batting" | "pitching" }> = [];
  const seen = new Set<string>();

  for (const category of source) {
    const name = normalizeCommandCategoryName(category.name);
    const type = category.type ?? inferCategoryType(name);
    const key = `${type}:${name}`;

    if (!name || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ name, type });
  }

  return result;
}

function isReserveRosterSlot(rosterSlot: string | undefined | null): boolean {
  const slot = (rosterSlot ?? "").trim().toUpperCase();
  return slot.includes("MIN") || slot.includes("TAXI");
}

function activeAuctionEntries(entries: readonly RosterEntry[]): RosterEntry[] {
  return entries.filter((entry) => !isReserveRosterSlot(entry.rosterSlot));
}

function teamNamesForLeague(league: CommandCenterLeagueLike): string[] {
  if (!league) {
    return [];
  }

  const count = Math.max(league.teamNames?.length ?? 0, league.teams ?? 0);
  const names: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const configured = league.teamNames?.[i]?.trim();
    names.push(configured || `Team ${i + 1}`);
  }

  return names;
}

function buildPlayerMap(allPlayers: readonly Player[]): Map<string, Player> {
  const map = new Map<string, Player>();

  for (const player of allPlayers) {
    map.set(player.id, player);

    if (Number.isFinite(player.mlbId) && String(player.mlbId) !== player.id) {
      map.set(String(player.mlbId), player);
    }
  }

  return map;
}

function playerFromEntry(playerMap: Map<string, Player>, entry: RosterEntry): Player | null {
  return playerMap.get(entry.externalPlayerId) ?? null;
}

function playerMatchesExternalId(player: Player, externalPlayerId: string): boolean {
  return player.id === externalPlayerId || String(player.mlbId) === externalPlayerId;
}

function playerIsDrafted(player: Player, entries: readonly RosterEntry[]): boolean {
  return entries.some((entry) => playerMatchesExternalId(player, entry.externalPlayerId));
}

export function getProjectedStat(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const key = normalizeCommandCategoryName(catName);

  if (catType === "batting") {
    const projection = record(player.projection?.batting);
    const stats = record(player.stats?.batting);
    const source = Object.keys(projection).length > 0 ? projection : stats;

    if (key === "R") return finiteNumber(source.runs) ?? 0;
    if (key === "HR") return finiteNumber(source.hr) ?? 0;
    if (key === "RBI") return finiteNumber(source.rbi) ?? 0;
    if (key === "SB") return finiteNumber(source.sb) ?? 0;
    if (key === "AVG") return finiteNumber(source.avg) ?? 0;
    if (key === "OBP") return finiteNumber(stats.obp) ?? finiteNumber(source.obp) ?? 0;
    if (key === "SLG") return finiteNumber(stats.slg) ?? finiteNumber(source.slg) ?? 0;
    if (key === "TB") return finiteNumber(stats.tb) ?? finiteNumber(source.tb) ?? 0;
    if (key === "H") return finiteNumber(stats.h) ?? finiteNumber(stats.hits) ?? finiteNumber(source.h) ?? finiteNumber(source.hits) ?? 0;
    if (key === "BB") return finiteNumber(stats.bb) ?? finiteNumber(stats.walks) ?? finiteNumber(source.bb) ?? finiteNumber(source.walks) ?? 0;

    return 0;
  }

  const projection = record(player.projection?.pitching);
  const stats = record(player.stats?.pitching);
  const source = Object.keys(projection).length > 0 ? projection : stats;

  if (key === "W") return finiteNumber(source.wins) ?? 0;
  if (key === "K") return finiteNumber(source.strikeouts) ?? 0;
  if (key === "ERA") return finiteNumber(source.era) ?? 0;
  if (key === "WHIP") return finiteNumber(source.whip) ?? 0;
  if (key === "SV") return finiteNumber(source.saves) ?? 0;
  if (key === "HLD") return finiteNumber(source.holds) ?? 0;
  if (key === "CG") return finiteNumber(source.completeGames) ?? 0;
  if (key === "IP") return finiteNumber(source.innings) ?? finiteNumber(stats.innings) ?? 0;

  return 0;
}

function battingHitsAndAtBats(player: Player): { hits: number; atBats: number } | null {
  const projection = record(player.projection?.batting);
  const stats = record(player.stats?.batting);
  const springStats = record(record(player).springStats);
  const springBatting = record(springStats.batting);

  const atBats = Math.max(
    0,
    finiteNumber(projection.ab) ??
      finiteNumber(projection.atBats) ??
      finiteNumber(projection.at_bats) ??
      finiteNumber(stats.ab) ??
      finiteNumber(stats.atBats) ??
      finiteNumber(stats.at_bats) ??
      finiteNumber(springBatting.ab) ??
      0,
  );

  const explicitHits =
    finiteNumber(projection.hits) ??
    finiteNumber(projection.h) ??
    finiteNumber(stats.hits) ??
    finiteNumber(stats.h);

  if (atBats > 0 && explicitHits !== null) {
    return { hits: explicitHits, atBats };
  }

  const avg = finiteNumber(projection.avg) ?? finiteNumber(stats.avg);

  if (atBats > 0 && avg !== null && avg > 0 && avg <= 1) {
    return { hits: avg * atBats, atBats };
  }

  return null;
}

function teamBattingRate(players: Player[], catName: string): number {
  const key = normalizeCommandCategoryName(catName);

  if (key === "AVG") {
    let hits = 0;
    let atBats = 0;

    for (const player of players) {
      const chunk = battingHitsAndAtBats(player);

      if (chunk) {
        hits += chunk.hits;
        atBats += chunk.atBats;
      }
    }

    if (atBats > 0) {
      return hits / atBats;
    }
  }

  const batters = players.filter((player) => player.projection?.batting || player.stats?.batting);
  const weights = batters.map((player) => {
    const batting = player.projection?.batting ?? player.stats?.batting;
    return (finiteNumber((batting as { hr?: unknown } | undefined)?.hr) ?? 0) + 1;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return batters.reduce(
    (sum, player, index) => sum + getProjectedStat(player, key, "batting") * weights[index],
    0,
  ) / totalWeight;
}

function teamPitchingRate(players: Player[], catName: string): number {
  const pitchers = players.filter((player) => player.projection?.pitching || player.stats?.pitching);
  let weightedSum = 0;
  let totalInnings = 0;

  for (const player of pitchers) {
    const rate = getProjectedStat(player, catName, "pitching");
    const projection = record(player.projection?.pitching);
    const stats = record(player.stats?.pitching);
    const innings = finiteNumber(projection.innings) ?? finiteNumber(stats.innings) ?? 0;

    if (innings > 0 && Number.isFinite(rate)) {
      weightedSum += rate * innings;
      totalInnings += innings;
    }
  }

  if (totalInnings > 0) {
    return weightedSum / totalInnings;
  }

  const values = pitchers
    .map((player) => getProjectedStat(player, catName, "pitching"))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function categoryAggregation(
  catName: string,
  catType: "batting" | "pitching",
): "lower" | "higher" | "sum" {
  const key = normalizeCommandCategoryName(catName);

  if (catType === "pitching") {
    return LOWER_IS_BETTER_CATS.has(key) ? "lower" : "sum";
  }

  return ROTO_RATE_BATTING_CATEGORIES.has(key) ? "higher" : "sum";
}

function categoryValueForPlayers(
  players: Player[],
  category: { name: string; type: "batting" | "pitching" },
): number {
  const aggregation = categoryAggregation(category.name, category.type);

  if (aggregation === "higher") {
    return teamBattingRate(players, category.name);
  }

  if (aggregation === "lower") {
    return teamPitchingRate(players, category.name);
  }

  return players.reduce(
    (sum, player) => sum + getProjectedStat(player, category.name, category.type),
    0,
  );
}

function computeRanks(
  rows: MobileTeamProjectionRow[],
  categoryName: string,
): Map<string, number> {
  const key = normalizeCommandCategoryName(categoryName);
  const lowerIsBetter = LOWER_IS_BETTER_CATS.has(key);
  const sorted = [...rows].sort((a, b) => {
    const av = a.categoryValues[key] ?? 0;
    const bv = b.categoryValues[key] ?? 0;

    if (lowerIsBetter) {
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return av - bv;
    }

    return bv - av;
  });

  const ranks = new Map<string, number>();
  sorted.forEach((row, index) => ranks.set(row.teamId, index + 1));
  return ranks;
}

function rotoPointsForRank(rank: number, teamCount: number): number {
  if (!Number.isFinite(rank) || rank < 1) {
    return 1;
  }

  return Math.max(1, teamCount - rank + 1);
}

function buildStandingsFromEntries(
  teamNames: string[],
  entries: readonly RosterEntry[],
  allPlayers: readonly Player[],
  categories: Array<{ name: string; type: "batting" | "pitching" }>,
): MobileTeamProjectionRow[] {
  const activeEntries = activeAuctionEntries(entries);
  const playerMap = buildPlayerMap(allPlayers);
  const rows: MobileTeamProjectionRow[] = teamNames.map((teamName, index) => {
    const teamId = `team_${index + 1}`;
    const teamPlayers = activeEntries
      .filter((entry) => entry.teamId === teamId)
      .map((entry) => playerFromEntry(playerMap, entry))
      .filter((player): player is Player => Boolean(player));

    const categoryValues: Record<string, number> = {};

    for (const category of categories) {
      categoryValues[category.name] = categoryValueForPlayers(teamPlayers, category);
    }

    return {
      teamId,
      teamName,
      totalPoints: 0,
      categoryValues,
      categoryPoints: {},
    };
  });

  const teamCount = Math.max(rows.length, 1);

  for (const category of categories) {
    const ranks = computeRanks(rows, category.name);

    for (const row of rows) {
      const rank = ranks.get(row.teamId);
      row.categoryPoints[category.name] = rank ? rotoPointsForRank(rank, teamCount) : 0;
    }
  }

  for (const row of rows) {
    row.totalPoints = Object.values(row.categoryPoints).reduce(
      (sum, value) => sum + value,
      0,
    );
  }

  return rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    return a.teamName.localeCompare(b.teamName);
  });
}

export function buildMobileProjectedStandings(
  league: CommandCenterLeagueLike,
  allPlayers: readonly Player[],
  rosterEntries: readonly RosterEntry[],
): MobileTeamProjectionRow[] {
  const teamNames = teamNamesForLeague(league);

  if (teamNames.length === 0) {
    return [];
  }

  return buildStandingsFromEntries(
    teamNames,
    rosterEntries,
    allPlayers,
    normalizedCategories(league?.scoringCategories),
  );
}

export function commandCenterCategoryNames(
  scoringCategories: CommandCenterScoringCategory[] | undefined,
  side: "batting" | "pitching",
): string[] {
  const source = normalizedCategories(scoringCategories).filter(
    (category) => category.type === side,
  );

  if (source.length > 0) {
    return source.map((category) => category.name);
  }

  return (side === "batting" ? FALLBACK_HITTING_CATS : FALLBACK_PITCHING_CATS).map(
    (category) => normalizeCommandCategoryName(category.name),
  );
}

function teamIdIndex(teamId: string): number {
  const value = Number.parseInt(teamId.replace(/^team_/i, ""), 10);
  return Number.isFinite(value) && value > 0 ? value - 1 : 0;
}

function teamNameForId(league: CommandCenterLeagueLike, teamId: string): string {
  const names = teamNamesForLeague(league);
  return names[teamIdIndex(teamId)] ?? `Team ${teamIdIndex(teamId) + 1}`;
}

function rotoDeltaForCategory(
  baseRows: MobileTeamProjectionRow[],
  withPlayerRows: MobileTeamProjectionRow[],
  myTeamId: string,
  categoryName: string,
): number {
  const before = baseRows.find((row) => row.teamId === myTeamId)?.categoryPoints[categoryName] ?? 0;
  const after = withPlayerRows.find((row) => row.teamId === myTeamId)?.categoryPoints[categoryName] ?? 0;
  return after - before;
}

export function buildMobileCategoryImpactRows(input: {
  player: Player | null;
  side: "batting" | "pitching";
  scoringCategories: CommandCenterScoringCategory[] | undefined;
  league: CommandCenterLeagueLike;
  allPlayers: readonly Player[];
  rosterEntries: readonly RosterEntry[];
  myTeamId: string;
}): MobileCategoryImpactRow[] {
  const {
    player,
    side,
    scoringCategories,
    league,
    allPlayers,
    rosterEntries,
    myTeamId,
  } = input;

  if (!player || !league) {
    return [];
  }

  const categories = normalizedCategories(scoringCategories).filter(
    (category) => category.type === side,
  );
  const teamNames = teamNamesForLeague(league);
  const playerMap = buildPlayerMap(allPlayers);
  const activeEntries = activeAuctionEntries(rosterEntries);
  const myPlayers = activeEntries
    .filter((entry) => entry.teamId === myTeamId)
    .map((entry) => playerFromEntry(playerMap, entry))
    .filter((item): item is Player => Boolean(item));
  const canSimulate =
    teamNames.length >= 2 &&
    !playerIsDrafted(player, activeEntries) &&
    !myPlayers.some((item) => item.id === player.id || item.mlbId === player.mlbId);

  const baseRows = buildStandingsFromEntries(
    teamNames,
    activeEntries,
    allPlayers,
    categories,
  );
  const withPlayerRows = canSimulate
    ? buildStandingsFromEntries(
        teamNames,
        [
          ...activeEntries,
          {
            _id: `__mobile_category_impact__:${player.id}`,
            leagueId: league.id ?? "mobile-command-center",
            userId: "mobile-command-center",
            teamId: myTeamId,
            externalPlayerId: player.id,
            playerName: player.name,
            playerTeam: player.team,
            positions: player.positions?.length ? player.positions : [player.position],
            price: 0,
            rosterSlot: "BN",
            isKeeper: false,
            acquiredAt: new Date(0).toISOString(),
            createdAt: new Date(0).toISOString(),
          },
        ],
        allPlayers,
        categories,
      )
    : baseRows;

  return categories.map((category) => {
    const aggregation = categoryAggregation(category.name, category.type);
    const before = categoryValueForPlayers(myPlayers, category);
    const after = categoryValueForPlayers([...myPlayers, player], category);
    const playerValue = aggregation === "sum"
      ? getProjectedStat(player, category.name, category.type)
      : categoryValueForPlayers([player], category);
    const points = canSimulate
      ? rotoDeltaForCategory(baseRows, withPlayerRows, myTeamId, category.name)
      : 0;

    return {
      cat: category.name,
      value: playerValue,
      before,
      after,
      points,
    };
  });
}
