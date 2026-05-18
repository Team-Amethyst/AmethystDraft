import type { Player } from "../types/player";
import { catalogPlayerIdInStringSet } from "../domain/catalogPlayerKeys";
import {
  groupPlayersByDisplayTier,
  type DisplayTierGroupingOptions,
  type DisplayTierGroup,
} from "../domain/displayTiers";
import { displayAuctionTier } from "../domain/playerRankTier";
import { countResearchTablePositionParts } from "./eligibility";
import { researchTableAuctionDollars } from "../domain/researchDraftedDisplay";
import { formatAuctionValueRaw } from "../domain/researchAuctionValueDisplay";
import { leagueWideAuctionDollars, formatCurrencyWhole } from "./valuation";

export type TierGroup = { tier: string | number; players: Player[] };

export type TierSortField =
  | "auction_value"
  | "auction_rank"
  | "market_adp"
  | "position"
  | "recommended_bid"
  | "team_value";

/** Raw model auction dollars for tier math (may include cents). */
export function rawAuctionValue(
  player: Pick<Player, "auction_value" | "recommended_bid" | "team_value">,
): number {
  return (
    leagueWideAuctionDollars(player) ??
    player.recommended_bid ??
    player.team_value ??
    0
  );
}

/** Engine auction dollars for tier bands/cliffs — omits catalog fallbacks and ineligible rows. */
export function rawTierAuctionValue(
  player: Pick<
    Player,
    "auction_value" | "valuation_eligible" | "recommended_bid" | "team_value"
  >,
): number | null {
  if (player.valuation_eligible === false) return null;
  const dollars = leagueWideAuctionDollars(player);
  return dollars === undefined ? null : dollars;
}

export function playerHasTierAuctionValue(
  player: Pick<Player, "auction_value" | "valuation_eligible">,
): boolean {
  return rawTierAuctionValue(player) !== null;
}

export function tierPlayersWithAuctionValue(players: readonly Player[]): Player[] {
  return players.filter((p) => playerHasTierAuctionValue(p));
}

/** Whole-dollar display for UI labels. */
export function displayAuctionValue(
  player: Pick<Player, "auction_value" | "recommended_bid" | "team_value">,
): number {
  return Math.round(rawAuctionValue(player));
}

export type TierStats = {
  tier: string | number;
  players: Player[];
  positionCounts: Record<string, number>;
  /** Raw dollars (unrounded). */
  averageValueRaw: number;
  minValueRaw: number;
  maxValueRaw: number;
  /** Whole-dollar display range (absolute min–max). */
  minValueDisplay: number;
  maxValueDisplay: number;
  /** Whole-dollar floor excluding sub–$2 min-bid shelf when present. */
  minCoreValueDisplay: number;
  /** Players valued below {@link MEANINGFUL_BAND_FLOOR_RAW}. */
  shelvedCount: number;
  /** Rows with an Engine auction dollar (eligible for band math). */
  valuedPlayerCount: number;
  draftedCount: number;
  availableCount: number;
  /** Still on the board in this tier. */
  availablePlayers: Player[];
  /** Drafted but kept in this tier for context. */
  draftedPlayers: Player[];
  /** Drop from this tier's floor to the next tier's ceiling (raw). */
  cliffToNextTierRaw: number | null;
  topPlayerNames: string[];
  /** True when the band is mostly min-bid / replacement depth. */
  isMinBidStyleTier: boolean;
  /** True when value spread inside the tier is negligible. */
  isFlatValueBand: boolean;
};

export const MEANINGFUL_CLIFF_RAW_THRESHOLD = 0.5;

/** Raw values below this are treated as min-bid shelf for band / cliff display. */
export const MEANINGFUL_BAND_FLOOR_RAW = 2;

export function tierMeaningfulFloorRaw(players: Player[]): number {
  const raws = tierPlayersWithAuctionValue(players)
    .map((p) => rawTierAuctionValue(p)!)
    .filter((v) => v >= MEANINGFUL_BAND_FLOOR_RAW);
  if (raws.length === 0) return 0;
  return Math.min(...raws);
}

export function tierShelvedCount(players: Player[]): number {
  return tierPlayersWithAuctionValue(players).filter((p) => {
    const raw = rawTierAuctionValue(p)!;
    return raw < MEANINGFUL_BAND_FLOOR_RAW;
  }).length;
}

export type TierBandDisplay = {
  rangeLabel: string;
  shelfNote: string | null;
};

/** Raw min–max for available valued players in a tier (null for empty / min-bid shelf). */
export function formatTierRawValueRange(
  stat: Pick<
    TierStats,
    "minValueRaw" | "maxValueRaw" | "valuedPlayerCount" | "maxValueDisplay"
  >,
): string | null {
  if (stat.valuedPlayerCount === 0) return null;
  if (stat.maxValueDisplay < MEANINGFUL_BAND_FLOOR_RAW) return null;
  const { minValueRaw: min, maxValueRaw: max } = stat;
  if (min === max) return formatAuctionValueRaw(min);
  return `${formatAuctionValueRaw(min)}–${formatAuctionValueRaw(max)}`;
}

/** Collapsed tier value column hover: rounding note only (no raw band). */
export function formatTierBandRangeTooltip(
  _stat: Pick<
    TierStats,
    "minValueRaw" | "maxValueRaw" | "valuedPlayerCount" | "maxValueDisplay"
  >,
): string {
  return "Displayed dollars are rounded. Tiers and cliffs use raw auction values.";
}

export function formatTierBandDisplay(
  stat: Pick<
    TierStats,
    | "minValueDisplay"
    | "maxValueDisplay"
    | "minCoreValueDisplay"
    | "shelvedCount"
    | "valuedPlayerCount"
  >,
): TierBandDisplay {
  if (stat.valuedPlayerCount === 0) {
    return { rangeLabel: "—", shelfNote: null };
  }

  if (stat.maxValueDisplay < MEANINGFUL_BAND_FLOOR_RAW) {
    return {
      rangeLabel: "Min bid shelf",
      shelfNote:
        stat.shelvedCount > 1 ? `${stat.shelvedCount} at min bid` : null,
    };
  }

  const showCoreBand =
    stat.shelvedCount > 0 &&
    stat.minCoreValueDisplay >= MEANINGFUL_BAND_FLOOR_RAW &&
    stat.minCoreValueDisplay > stat.minValueDisplay;

  return {
    rangeLabel: formatTierValueRange(
      showCoreBand ? stat.minCoreValueDisplay : stat.minValueDisplay,
      stat.maxValueDisplay,
    ),
    shelfNote: showCoreBand
      ? `+${stat.shelvedCount} at min bid`
      : null,
  };
}

/** Engine auction_tier buckets (audit / metadata). */
export function groupPlayersByEngineTier(players: Player[]): TierGroup[] {
  const map = new Map<string | number, Player[]>();

  for (const p of players) {
    const key = displayAuctionTier(p) ?? p.catalog_tier ?? "unassigned";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    if (a[0] === "unassigned") return 1;
    if (b[0] === "unassigned") return -1;
    const na = Number(a[0]);
    const nb = Number(b[0]);
    return na - nb;
  });

  return entries.map(([tier, arr]) => ({ tier, players: arr }));
}

/** @deprecated Prefer {@link groupPlayersByEngineTier} for Engine buckets. */
export const groupPlayersByTier = groupPlayersByEngineTier;

export function topPlayerNamesByAuctionValue(
  players: Player[],
  limit = 3,
): string[] {
  return [...tierPlayersWithAuctionValue(players)]
    .sort(
      (a, b) =>
        (rawTierAuctionValue(b) ?? 0) - (rawTierAuctionValue(a) ?? 0),
    )
    .slice(0, limit)
    .map((p) => p.name);
}

export function formatTierValueRange(
  minDisplay: number,
  maxDisplay: number,
): string {
  if (minDisplay < MEANINGFUL_BAND_FLOOR_RAW && maxDisplay < MEANINGFUL_BAND_FLOOR_RAW) {
    return "Min bid shelf";
  }
  if (minDisplay === maxDisplay) {
    return formatCurrency(minDisplay);
  }
  return `${formatCurrency(minDisplay)}–${formatCurrency(maxDisplay)}`;
}

export function formatCliffToNextTierLabel(args: {
  cliffRaw: number | null;
  isMinBidStyleTier: boolean;
  isFlatValueBand: boolean;
  hasNextTier: boolean;
  tierNumber: string | number;
}): string {
  if (args.isMinBidStyleTier) {
    return "Replacement pool";
  }
  if (
    !args.hasNextTier ||
    args.cliffRaw == null ||
    args.cliffRaw < MEANINGFUL_CLIFF_RAW_THRESHOLD ||
    args.isFlatValueBand
  ) {
    return "No meaningful drop";
  }
  const drop = Math.round(args.cliffRaw);
  return `$${drop} drop after tier`;
}

export function isNumericAuctionTier(tier: string | number): boolean {
  const n = typeof tier === "number" ? tier : Number(tier);
  return Number.isFinite(n) && n >= 1 && n <= 5;
}

export function isPlayerDraftedForTiers(
  player: Pick<Player, "id" | "mlbId">,
  draftedIds: ReadonlySet<string>,
): boolean {
  return catalogPlayerIdInStringSet(draftedIds, player);
}

export function splitTierPlayersByDraftStatus(
  players: readonly Player[],
  draftedIds: ReadonlySet<string>,
): { available: Player[]; drafted: Player[] } {
  const available: Player[] = [];
  const drafted: Player[] = [];
  for (const p of players) {
    if (isPlayerDraftedForTiers(p, draftedIds)) {
      drafted.push(p);
    } else {
      available.push(p);
    }
  }
  return { available, drafted };
}

export function parseDraftedPriceFromContract(
  contractLabel: string | undefined,
): number | undefined {
  if (!contractLabel?.trim()) return undefined;
  const match = contractLabel.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/** Display/sort auction dollars in tiers — price paid when drafted, else model value. */
export function tierPlayerDisplayDollars(
  player: Player,
  options?: {
    draftedIds?: ReadonlySet<string>;
    draftedPriceByPlayerId?: ReadonlyMap<string, number>;
    draftedContractByPlayerId?: ReadonlyMap<string, string>;
  },
): number | undefined {
  return researchTableAuctionDollars(player, options);
}

/** Split pool into T1–T5 tier rows vs muted “not in valuation model” section. */
export function partitionPlayersForTierView(
  players: readonly Player[],
  draftedIds: ReadonlySet<string>,
): { tiered: Player[]; outsideModel: Player[] } {
  const tiered: Player[] = [];
  const outsideModel: Player[] = [];

  for (const p of players) {
    if (isPlayerDraftedForTiers(p, draftedIds)) {
      tiered.push(p);
      continue;
    }
    if (playerHasTierAuctionValue(p)) {
      tiered.push(p);
      continue;
    }
    outsideModel.push(p);
  }

  return { tiered, outsideModel };
}

export type FullTierView = {
  tiers: TierStats[];
  outsideModel: TierStats | null;
};

export type BuildFullTierViewOptions = DisplayTierGroupingOptions & {
  rosterSlotKeys?: readonly string[] | null;
};

function isBuildFullTierViewOptions(
  options: BuildFullTierViewOptions | readonly string[] | null | undefined,
): options is BuildFullTierViewOptions {
  return options != null && !Array.isArray(options);
}

function resolveBuildFullTierViewOptions(
  draftedIds: ReadonlySet<string>,
  options?: BuildFullTierViewOptions | readonly string[] | null,
): {
  rosterSlotKeys: readonly string[] | null | undefined;
  grouping: DisplayTierGroupingOptions;
} {
  if (options == null) {
    return { rosterSlotKeys: undefined, grouping: { draftedIds } };
  }
  if (Array.isArray(options)) {
    return { rosterSlotKeys: options, grouping: { draftedIds } };
  }
  if (isBuildFullTierViewOptions(options)) {
    return {
      rosterSlotKeys: options.rosterSlotKeys,
      grouping: {
        draftedIds,
        draftedPriceByPlayerId: options.draftedPriceByPlayerId,
        draftedContractByPlayerId: options.draftedContractByPlayerId,
        leagueBudget: options.leagueBudget,
      },
    };
  }
  return { rosterSlotKeys: undefined, grouping: { draftedIds } };
}

export function buildFullTierView(
  players: Player[],
  draftedIds: ReadonlySet<string>,
  positionFilter: string,
  options?: BuildFullTierViewOptions | readonly string[] | null,
): FullTierView {
  const { rosterSlotKeys, grouping } = resolveBuildFullTierViewOptions(
    draftedIds,
    options,
  );
  const filtered =
    positionFilter === "all"
      ? players
      : players.filter((p) => p.position === positionFilter);

  const { tiered, outsideModel: outsidePlayers } = partitionPlayersForTierView(
    filtered,
    draftedIds,
  );

  const tierGroups: DisplayTierGroup[] = groupPlayersByDisplayTier(
    tiered,
    grouping,
  );
  const tiers = calculateTierStats(tierGroups, draftedIds, rosterSlotKeys);

  let outsideModel: TierStats | null = null;
  if (outsidePlayers.length > 0) {
    const [stat] = calculateTierStats(
      [{ tier: "outside", players: outsidePlayers }],
      draftedIds,
      rosterSlotKeys,
    );
    outsideModel = stat ?? null;
  }

  return { tiers, outsideModel };
}

export function isTierDepleted(
  stat: Pick<TierStats, "availableCount">,
): boolean {
  return stat.availableCount === 0;
}

export type TierAvailabilitySummary = {
  primary: string;
  /** Total players in tier (available + drafted). */
  title?: string;
};

export function formatTierAvailabilitySummary(
  stat: Pick<TierStats, "availableCount" | "draftedCount" | "players">,
): TierAvailabilitySummary {
  const total = stat.players.length;
  const title = total > 0 ? `${total} players in tier` : undefined;

  if (isTierDepleted(stat)) {
    return {
      primary:
        stat.draftedCount > 0
          ? `Depleted · ${stat.draftedCount} drafted`
          : "Depleted",
      title,
    };
  }

  let primary = `${stat.availableCount} left`;
  if (stat.draftedCount > 0) {
    primary += ` · ${stat.draftedCount} drafted`;
  }
  return { primary, title };
}

export function isDeemphasizedTier(stat: TierStats): boolean {
  return (
    isTierDepleted(stat) ||
    stat.isMinBidStyleTier ||
    (stat.isFlatValueBand && stat.tier !== 1) ||
    stat.tier === 5
  );
}

export function calculateTierStats(
  groups: TierGroup[],
  draftedIds: ReadonlySet<string>,
  rosterSlotKeys?: readonly string[] | null,
): TierStats[] {
  const stats: TierStats[] = [];

  for (let idx = 0; idx < groups.length; idx++) {
    const group = groups[idx];
    const { available: availablePlayers, drafted: draftedPlayers } =
      splitTierPlayersByDraftStatus(group.players, draftedIds);
    const draftedCount = draftedPlayers.length;
    const valuedPlayers = tierPlayersWithAuctionValue(availablePlayers);
    let totalValueRaw = 0;
    let minValueRaw = Infinity;
    let maxValueRaw = -Infinity;

    for (const p of valuedPlayers) {
      const value = rawTierAuctionValue(p)!;
      totalValueRaw += value;
      minValueRaw = Math.min(minValueRaw, value);
      maxValueRaw = Math.max(maxValueRaw, value);
    }

    const availableCount = availablePlayers.length;
    const positionCounts = countResearchTablePositionParts(
      availablePlayers,
      rosterSlotKeys,
    );
    const valuedPlayerCount = valuedPlayers.length;
    const averageValueRaw =
      valuedPlayerCount > 0 ? totalValueRaw / valuedPlayerCount : 0;

    const minDisplay =
      minValueRaw === Infinity
        ? 0
        : displayAuctionValue({ auction_value: minValueRaw });
    const maxDisplay =
      maxValueRaw === -Infinity
        ? 0
        : displayAuctionValue({ auction_value: maxValueRaw });
    const coreFloorRaw = tierMeaningfulFloorRaw(availablePlayers);
    const minCoreDisplay =
      coreFloorRaw > 0
        ? displayAuctionValue({ auction_value: coreFloorRaw })
        : minDisplay;
    const shelvedCount = tierShelvedCount(availablePlayers);

    const nextGroup = idx < groups.length - 1 ? groups[idx + 1] : null;
    let cliffToNextTierRaw: number | null = null;
    if (nextGroup && valuedPlayerCount > 0) {
      const nextAvailable = splitTierPlayersByDraftStatus(
        nextGroup.players,
        draftedIds,
      ).available;
      const nextValued = tierPlayersWithAuctionValue(nextAvailable);
      if (nextValued.length > 0) {
        let nextMaxRaw = -Infinity;
        for (const p of nextValued) {
          nextMaxRaw = Math.max(nextMaxRaw, rawTierAuctionValue(p)!);
        }
        const floorForCliff =
          coreFloorRaw >= MEANINGFUL_BAND_FLOOR_RAW
            ? coreFloorRaw
            : minValueRaw === Infinity
              ? 0
              : minValueRaw;
        cliffToNextTierRaw = floorForCliff - nextMaxRaw;
      }
    }

    const spreadRaw =
      minValueRaw === Infinity || maxValueRaw === -Infinity
        ? 0
        : maxValueRaw - minValueRaw;
    const isFlatValueBand = spreadRaw < MEANINGFUL_CLIFF_RAW_THRESHOLD;
    const isMinBidStyleTier =
      valuedPlayerCount >= 5 &&
      maxDisplay < MEANINGFUL_BAND_FLOOR_RAW &&
      averageValueRaw < MEANINGFUL_BAND_FLOOR_RAW;

    stats.push({
      tier: group.tier,
      players: group.players,
      positionCounts,
      averageValueRaw,
      minValueRaw: minValueRaw === Infinity ? 0 : minValueRaw,
      maxValueRaw: maxValueRaw === -Infinity ? 0 : maxValueRaw,
      minValueDisplay: minDisplay,
      maxValueDisplay: maxDisplay,
      minCoreValueDisplay: minCoreDisplay,
      shelvedCount,
      valuedPlayerCount,
      draftedCount,
      availableCount,
      availablePlayers,
      draftedPlayers,
      cliffToNextTierRaw,
      topPlayerNames: topPlayerNamesByAuctionValue(availablePlayers),
      isMinBidStyleTier,
      isFlatValueBand,
    });
  }

  return stats;
}

export function isBoardMostlyFlatAfterTopTier(stats: TierStats[]): boolean {
  if (stats.length <= 1) return false;
  const lower = stats.slice(1);
  const minBidTiers = lower.filter((s) => s.isMinBidStyleTier).length;
  return minBidTiers >= Math.max(1, lower.length - 1);
}

export function sortPlayersInTier(
  players: Player[],
  sortBy: TierSortField,
): Player[] {
  return [...players].sort((a, b) => {
    const cmpNum = (x: number | undefined, y: number | undefined) => {
      const xv = x ?? (sortBy === "market_adp" ? Infinity : -Infinity);
      const yv = y ?? (sortBy === "market_adp" ? Infinity : -Infinity);
      return xv - yv;
    };

    switch (sortBy) {
      case "auction_value": {
        const av = rawTierAuctionValue(a) ?? -Infinity;
        const bv = rawTierAuctionValue(b) ?? -Infinity;
        return bv - av;
      }
      case "auction_rank": {
        const ar = cmpNum(a.auction_rank, b.auction_rank);
        return ar !== 0 ? ar : rawAuctionValue(b) - rawAuctionValue(a);
      }
      case "market_adp": {
        const mr = cmpNum(a.market_adp, b.market_adp);
        return mr !== 0 ? mr : rawAuctionValue(b) - rawAuctionValue(a);
      }
      case "position": {
        const pos = (a.position ?? "").localeCompare(b.position ?? "");
        return pos !== 0 ? pos : rawAuctionValue(b) - rawAuctionValue(a);
      }
      case "recommended_bid":
        return (b.recommended_bid ?? 0) - (a.recommended_bid ?? 0);
      case "team_value":
        return (b.team_value ?? 0) - (a.team_value ?? 0);
      default:
        return rawAuctionValue(b) - rawAuctionValue(a);
    }
  });
}

/** @deprecated Use {@link sortPlayersInTier}. */
export function sortPlayersByValue(
  players: Player[],
  sortBy: "auction_value" | "recommended_bid" | "team_value" = "auction_value",
): Player[] {
  return sortPlayersInTier(players, sortBy);
}

export function formatCurrency(value: number): string {
  return formatCurrencyWhole(value);
}

export type TierAuditRow = {
  name: string;
  playerId: string;
  rawAuctionValue: number;
  displayedAuctionValue: string;
  auctionRank: number | null;
  tier: string | number;
  tierAverageRaw: number;
  tierMinRaw: number;
  tierMaxRaw: number;
  cliffToNextTierRaw: number | null;
  position: string;
};

export function auditTierInputs(
  players: Player[],
  draftedIds: ReadonlySet<string>,
  limit = 75,
  rosterSlotKeys?: readonly string[] | null,
): {
  rows: TierAuditRow[];
  tierSummaries: Array<{
    tier: string | number;
    count: number;
    avgRaw: number;
    minRaw: number;
    maxRaw: number;
    cliffToNextRaw: number | null;
    positionCounts: Record<string, number>;
  }>;
  diagnosis: string;
} {
  const groups = groupPlayersByDisplayTier(players, { draftedIds });
  const stats = calculateTierStats(groups, draftedIds, rosterSlotKeys);

  const tierSummaries = stats.map((s) => ({
    tier: s.tier,
    count: s.players.length,
    avgRaw: s.averageValueRaw,
    minRaw: s.minValueRaw,
    maxRaw: s.maxValueRaw,
    cliffToNextRaw: s.cliffToNextTierRaw,
    positionCounts: s.positionCounts,
  }));

  const valued = [...players]
    .filter((p) => rawAuctionValue(p) > 0 || p.auction_value != null)
    .sort((a, b) => rawAuctionValue(b) - rawAuctionValue(a))
    .slice(0, limit);

  const tierByPlayerId = new Map<string, TierStats>();
  for (const s of stats) {
    for (const p of s.players) {
      tierByPlayerId.set(p.id, s);
    }
  }

  const rows: TierAuditRow[] = valued.map((p) => {
    const tierStat = tierByPlayerId.get(p.id);
    return {
      name: p.name,
      playerId: p.id,
      rawAuctionValue: rawAuctionValue(p),
      displayedAuctionValue: formatCurrency(displayAuctionValue(p)),
      auctionRank:
        typeof p.auction_rank === "number" && Number.isFinite(p.auction_rank)
          ? p.auction_rank
          : null,
      tier: displayAuctionTier(p) ?? p.catalog_tier ?? "unassigned",
      tierAverageRaw: tierStat?.averageValueRaw ?? 0,
      tierMinRaw: tierStat?.minValueRaw ?? 0,
      tierMaxRaw: tierStat?.maxValueRaw ?? 0,
      cliffToNextTierRaw: tierStat?.cliffToNextTierRaw ?? null,
      position: p.position ?? "",
    };
  });

  const tier1 = stats.find((s) => s.tier === 1);
  const lowerMeaningful = stats.filter(
    (s) => s.tier !== 1 && !s.isMinBidStyleTier && s.maxValueDisplay > 1,
  );

  let diagnosis: string;
  if (!tier1) {
    diagnosis = "No tier-1 group in pool; check auction_tier on valuation merge.";
  } else if (lowerMeaningful.length === 0 && stats.length > 1) {
    diagnosis =
      "Engine tiers 2–5 are mostly min-bid shelves after rounding; UI should de-emphasize lower tiers and lean on auction rank + scarcity.";
  } else if (tier1 && stats.filter((s) => s.isMinBidStyleTier).length >= 3) {
    diagnosis =
      "Tier grouping is valid but lower tiers collapse to $1 bands; cliffs and averages understate spread—use raw cliffs and value ranges.";
  } else {
    diagnosis =
      "Tier buckets carry signal across multiple bands; UI should surface ranges, cliffs, and top names per tier.";
  }

  return { rows, tierSummaries, diagnosis };
}

export function buildTierViewForPosition(
  players: Player[],
  draftedIds: ReadonlySet<string>,
  positionFilter: string,
  options?: BuildFullTierViewOptions | readonly string[] | null,
): TierStats[] {
  return buildFullTierView(players, draftedIds, positionFilter, options).tiers;
}

export function sortPlayersInTierWithDraftedDisplay(
  players: Player[],
  sortBy: TierSortField,
  displayOptions?: Parameters<typeof tierPlayerDisplayDollars>[1],
): Player[] {
  if (sortBy !== "auction_value") {
    return sortPlayersInTier(players, sortBy);
  }
  return [...players].sort((a, b) => {
    const av =
      tierPlayerDisplayDollars(a, displayOptions) ??
      rawTierAuctionValue(a) ??
      -Infinity;
    const bv =
      tierPlayerDisplayDollars(b, displayOptions) ??
      rawTierAuctionValue(b) ??
      -Infinity;
    return bv - av;
  });
}
