import type { ValuationResult } from "../api/engine";
import type { Player } from "../types/player";

export type MobileTierSortField =
  | "auction_value"
  | "auction_rank"
  | "market_adp"
  | "position"
  | "recommended_bid"
  | "team_value";

export type MobileDisplayTierNumber = 1 | 2 | 3 | 4 | 5;

export type MobileTierSortOption = {
  label: string;
  value: MobileTierSortField;
};

export type MobileTierBucket = {
  key: string;
  tier: MobileDisplayTierNumber | "outside";
  title: string;
  semanticLabel: string | null;
  shortRange: string | null;
  players: Player[];
  availablePlayers: Player[];
  draftedPlayers: Player[];
  availableCount: number;
  draftedCount: number;
  valueLabel: string;
  shelfNote: string | null;
  averageValueLabel: string;
  cliffLabel: string;
  topPlayerNames: string[];
  positionCounts: Record<string, number>;
  muted: boolean;
  depleted: boolean;
};

export type MobileTierView = {
  tiers: MobileTierBucket[];
  outsideModel: MobileTierBucket | null;
  totalPlayers: number;
};

type DisplayTierBand = {
  tier: MobileDisplayTierNumber;
  label: string;
  referenceMinInclusive: number;
  referenceMaxExclusive: number;
};

type ResolvedDisplayTierBand = {
  tier: MobileDisplayTierNumber;
  label: string;
  minInclusive: number;
  maxExclusive: number;
  shortRange: string;
};

type BuildMobileTierViewArgs = {
  players: Player[];
  valuationsByPlayerId: ReadonlyMap<string, ValuationResult>;
  draftedIds: ReadonlySet<string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
  leagueBudget?: number;
};

type TierMathSummary = {
  minRaw: number;
  maxRaw: number;
  averageRaw: number;
  valuedCount: number;
  minDisplay: number;
  maxDisplay: number;
  minCoreDisplay: number;
  shelvedCount: number;
  isMinBidStyleTier: boolean;
  isFlatValueBand: boolean;
};

export const MOBILE_TIER_SORT_OPTIONS: MobileTierSortOption[] = [
  { label: "Auction Value", value: "auction_value" },
  { label: "Auction Rank", value: "auction_rank" },
  { label: "Market ADP", value: "market_adp" },
  { label: "Position", value: "position" },
  { label: "Recommended Bid", value: "recommended_bid" },
  { label: "Team Value", value: "team_value" },
];

const REFERENCE_AUCTION_BUDGET = 260;
const MEANINGFUL_BAND_FLOOR_RAW = 2;
const MEANINGFUL_CLIFF_RAW_THRESHOLD = 0.5;

const DISPLAY_TIER_BANDS: DisplayTierBand[] = [
  {
    tier: 1,
    label: "Elite targets",
    referenceMinInclusive: 25,
    referenceMaxExclusive: Number.POSITIVE_INFINITY,
  },
  {
    tier: 2,
    label: "Strong starters",
    referenceMinInclusive: 15,
    referenceMaxExclusive: 25,
  },
  {
    tier: 3,
    label: "Starter targets",
    referenceMinInclusive: 10,
    referenceMaxExclusive: 15,
  },
  {
    tier: 4,
    label: "Depth values",
    referenceMinInclusive: 5,
    referenceMaxExclusive: 10,
  },
  {
    tier: 5,
    label: "Min-bid / reserve",
    referenceMinInclusive: 1,
    referenceMaxExclusive: 5,
  },
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

function playerRecord(player: Player): Record<string, unknown> {
  return player as unknown as Record<string, unknown>;
}

function valuationRecord(row: ValuationResult | undefined): Record<string, unknown> {
  return (row ?? {}) as unknown as Record<string, unknown>;
}

function playerNumber(player: Player, key: string): number | null {
  return finiteNumber(playerRecord(player)[key]);
}

function valuationNumber(row: ValuationResult | undefined, key: string): number | null {
  return finiteNumber(valuationRecord(row)[key]);
}

function formatCurrency(value: number): string {
  return `$${Math.round(value)}`;
}

function formatTierValueRange(minDisplay: number, maxDisplay: number): string {
  if (
    minDisplay < MEANINGFUL_BAND_FLOOR_RAW &&
    maxDisplay < MEANINGFUL_BAND_FLOOR_RAW
  ) {
    return "Min bid shelf";
  }

  if (minDisplay === maxDisplay) {
    return formatCurrency(minDisplay);
  }

  return `${formatCurrency(minDisplay)}–${formatCurrency(maxDisplay)}`;
}

function scaleTierDollarThreshold(
  referenceDollars: number,
  leagueBudget: number,
): number {
  if (!Number.isFinite(referenceDollars) || referenceDollars <= 0) {
    return 1;
  }

  if (!Number.isFinite(leagueBudget) || leagueBudget <= 0) {
    return referenceDollars;
  }

  return Math.max(
    1,
    Math.round((referenceDollars / REFERENCE_AUCTION_BUDGET) * leagueBudget),
  );
}

function formatDisplayTierDollarRange(
  minInclusive: number,
  maxExclusive: number,
): string {
  if (!Number.isFinite(maxExclusive)) {
    return `$${minInclusive}+`;
  }

  const maxInclusive = maxExclusive - 1;

  if (maxInclusive < minInclusive) {
    return `$${minInclusive}+`;
  }

  if (minInclusive === maxInclusive) {
    return `$${minInclusive}`;
  }

  return `$${minInclusive}–$${maxInclusive}`;
}

function resolveDisplayTierBands(leagueBudget?: number): ResolvedDisplayTierBand[] {
  const budget =
    typeof leagueBudget === "number" &&
    Number.isFinite(leagueBudget) &&
    leagueBudget > 0
      ? leagueBudget
      : REFERENCE_AUCTION_BUDGET;

  return DISPLAY_TIER_BANDS.map((band) => {
    const minInclusive = scaleTierDollarThreshold(
      band.referenceMinInclusive,
      budget,
    );

    const maxExclusive =
      band.referenceMaxExclusive === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : scaleTierDollarThreshold(band.referenceMaxExclusive, budget);

    return {
      tier: band.tier,
      label: band.label,
      minInclusive,
      maxExclusive,
      shortRange: formatDisplayTierDollarRange(minInclusive, maxExclusive),
    };
  });
}

function displayTierForRaw(
  raw: number,
  leagueBudget?: number,
): MobileDisplayTierNumber {
  const bands = resolveDisplayTierBands(leagueBudget);
  const minBidFloor = scaleTierDollarThreshold(
    1,
    leagueBudget ?? REFERENCE_AUCTION_BUDGET,
  );

  if (!Number.isFinite(raw) || raw < minBidFloor) {
    return 5;
  }

  for (const band of bands) {
    if (raw >= band.minInclusive) {
      return band.tier;
    }
  }

  return 5;
}

function bandForTier(
  tier: MobileDisplayTierNumber,
  leagueBudget?: number,
): ResolvedDisplayTierBand | null {
  return resolveDisplayTierBands(leagueBudget).find((band) => band.tier === tier) ?? null;
}

function playerKeyCandidates(player: Player): string[] {
  const keys = [player.id];

  const record = playerRecord(player);
  const mlbId =
    finiteNumber(record.mlbId) ??
    finiteNumber(record.mlb_id) ??
    finiteNumber(record.playerId);

  if (mlbId !== null) {
    keys.push(String(Math.round(mlbId)));
  }

  return Array.from(new Set(keys.filter(Boolean)));
}

function mapGetForPlayer<T>(
  map: ReadonlyMap<string, T> | undefined,
  player: Player,
): T | undefined {
  if (!map) return undefined;

  for (const key of playerKeyCandidates(player)) {
    const value = map.get(key);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function getMobileTierMapValue<T>(
  map: ReadonlyMap<string, T>,
  player: Player,
): T | undefined {
  return mapGetForPlayer(map, player);
}

export function mobileTierPlayerIsDrafted(
  player: Player,
  draftedIds: ReadonlySet<string>,
): boolean {
  for (const key of playerKeyCandidates(player)) {
    if (draftedIds.has(key)) {
      return true;
    }
  }

  return false;
}

function rawAuctionValueForTier(
  player: Player,
  row: ValuationResult | undefined,
): number | null {
  const value =
    valuationNumber(row, "auction_value") ??
    playerNumber(player, "auction_value") ??
    valuationNumber(row, "recommended_bid") ??
    playerNumber(player, "recommended_bid") ??
    valuationNumber(row, "team_value") ??
    playerNumber(player, "team_value") ??
    valuationNumber(row, "baseline_value") ??
    playerNumber(player, "value") ??
    finiteNumber(player.value);

  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function displayDollarsForPlayer(
  player: Player,
  row: ValuationResult | undefined,
  draftedIds: ReadonlySet<string>,
  draftedPriceByPlayerId?: ReadonlyMap<string, number>,
  draftedContractByPlayerId?: ReadonlyMap<string, string>,
): number | null {
  if (mobileTierPlayerIsDrafted(player, draftedIds)) {
    const paid = mapGetForPlayer(draftedPriceByPlayerId, player);

    if (paid !== undefined && Number.isFinite(paid)) {
      return paid;
    }

    const contract = mapGetForPlayer(draftedContractByPlayerId, player);

    if (contract) {
      const match = contract.match(/\$\s*(\d+(?:\.\d+)?)/);
      const parsed = match ? Number(match[1]) : NaN;

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return rawAuctionValueForTier(player, row);
}

function positionParts(player: Player): string[] {
  const raw = [player.position, ...(player.positions ?? [])]
    .join("/")
    .split("/")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const parts: string[] = [];

  for (const item of raw) {
    if (["LF", "CF", "RF"].includes(item)) {
      if (!parts.includes("OF")) {
        parts.push("OF");
      }
    } else if (!parts.includes(item)) {
      parts.push(item);
    }
  }

  return parts;
}

function countPositions(players: Player[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const player of players) {
    for (const position of positionParts(player)) {
      counts[position] = (counts[position] ?? 0) + 1;
    }
  }

  return counts;
}

function splitByDraftStatus(
  players: Player[],
  draftedIds: ReadonlySet<string>,
): { available: Player[]; drafted: Player[] } {
  const available: Player[] = [];
  const drafted: Player[] = [];

  for (const player of players) {
    if (mobileTierPlayerIsDrafted(player, draftedIds)) {
      drafted.push(player);
    } else {
      available.push(player);
    }
  }

  return { available, drafted };
}

function tierMathSummary(
  players: Player[],
  valuationsByPlayerId: ReadonlyMap<string, ValuationResult>,
): Omit<TierMathSummary, "cliffRaw"> {
  const rawValues: number[] = [];

  for (const player of players) {
    const raw = rawAuctionValueForTier(
      player,
      mapGetForPlayer(valuationsByPlayerId, player),
    );

    if (raw !== null) {
      rawValues.push(raw);
    }
  }

  if (rawValues.length === 0) {
    return {
      minRaw: 0,
      maxRaw: 0,
      averageRaw: 0,
      valuedCount: 0,
      minDisplay: 0,
      maxDisplay: 0,
      minCoreDisplay: 0,
      shelvedCount: 0,
      isMinBidStyleTier: false,
      isFlatValueBand: true,
    };
  }

  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);
  const averageRaw = rawValues.reduce((sum, value) => sum + value, 0) / rawValues.length;
  const meaningfulValues = rawValues.filter((value) => value >= MEANINGFUL_BAND_FLOOR_RAW);
  const minCoreRaw = meaningfulValues.length > 0 ? Math.min(...meaningfulValues) : minRaw;
  const shelvedCount = rawValues.filter((value) => value < MEANINGFUL_BAND_FLOOR_RAW).length;
  const maxDisplay = Math.round(maxRaw);
  const minDisplay = Math.round(minRaw);
  const minCoreDisplay = Math.round(minCoreRaw);
  const spreadRaw = maxRaw - minRaw;

  return {
    minRaw,
    maxRaw,
    averageRaw,
    valuedCount: rawValues.length,
    minDisplay,
    maxDisplay,
    minCoreDisplay,
    shelvedCount,
    isMinBidStyleTier:
      rawValues.length >= 5 &&
      maxDisplay < MEANINGFUL_BAND_FLOOR_RAW &&
      averageRaw < MEANINGFUL_BAND_FLOOR_RAW,
    isFlatValueBand: spreadRaw < MEANINGFUL_CLIFF_RAW_THRESHOLD,
  };
}

function formatValueBand(
  tier: MobileDisplayTierNumber | "outside",
  summary: Omit<TierMathSummary, "cliffRaw">,
  leagueBudget?: number,
): { valueLabel: string; shelfNote: string | null } {
  if (summary.valuedCount === 0) {
    return { valueLabel: "—", shelfNote: null };
  }

  if (summary.maxDisplay < MEANINGFUL_BAND_FLOOR_RAW) {
    return {
      valueLabel: "Min bid shelf",
      shelfNote:
        summary.shelvedCount > 1
          ? `${summary.shelvedCount} at min bid`
          : null,
    };
  }

  if (tier === "outside") {
    return {
      valueLabel: formatTierValueRange(summary.minDisplay, summary.maxDisplay),
      shelfNote: null,
    };
  }

  const band = bandForTier(tier, leagueBudget);
  const bandMin = band?.minInclusive ?? 1;
  const bandMax =
    band && Number.isFinite(band.maxExclusive)
      ? band.maxExclusive - 1
      : summary.maxDisplay;

  const showCoreBand =
    summary.shelvedCount > 0 &&
    summary.minCoreDisplay >= MEANINGFUL_BAND_FLOOR_RAW &&
    summary.minCoreDisplay > summary.minDisplay;

  const minForLabel = Math.max(
    showCoreBand ? summary.minCoreDisplay : summary.minDisplay,
    bandMin,
  );

  const maxForLabel = Math.min(summary.maxDisplay, bandMax);

  const shelfNote =
    showCoreBand && summary.shelvedCount > 0
      ? tier === 5
        ? summary.shelvedCount === 1
          ? "1 min-bid"
          : `${summary.shelvedCount} min-bid`
        : summary.shelvedCount === 1
          ? "1 at min bid"
          : `+${summary.shelvedCount} at min bid`
      : null;

  return {
    valueLabel: formatTierValueRange(minForLabel, maxForLabel),
    shelfNote,
  };
}

function formatCliffLabel(
  cliffRaw: number | null,
  hasNextTier: boolean,
  isMinBidStyleTier: boolean,
  isFlatValueBand: boolean,
): string {
  if (isMinBidStyleTier) {
    return "Replacement pool";
  }

  if (
    !hasNextTier ||
    cliffRaw === null ||
    cliffRaw < MEANINGFUL_CLIFF_RAW_THRESHOLD ||
    isFlatValueBand
  ) {
    return "No meaningful drop";
  }

  return `$${Math.round(cliffRaw)} drop after tier`;
}

function buildBucket(args: {
  tier: MobileDisplayTierNumber | "outside";
  title: string;
  semanticLabel: string | null;
  shortRange: string | null;
  players: Player[];
  draftedIds: ReadonlySet<string>;
  valuationsByPlayerId: ReadonlyMap<string, ValuationResult>;
  leagueBudget?: number;
  muted?: boolean;
  nextAvailablePlayers?: Player[];
}): MobileTierBucket {
  const split = splitByDraftStatus(args.players, args.draftedIds);
  const math = tierMathSummary(split.available, args.valuationsByPlayerId);
  const nextMath = args.nextAvailablePlayers
    ? tierMathSummary(args.nextAvailablePlayers, args.valuationsByPlayerId)
    : null;

  const cliffRaw =
    nextMath && math.valuedCount > 0 && nextMath.valuedCount > 0
      ? Math.max(0, math.minRaw - nextMath.maxRaw)
      : null;

  const band = formatValueBand(args.tier, math, args.leagueBudget);
  const depleted = split.available.length === 0;

  return {
    key: String(args.tier),
    tier: args.tier,
    title: args.title,
    semanticLabel: args.semanticLabel,
    shortRange: args.shortRange,
    players: args.players,
    availablePlayers: split.available,
    draftedPlayers: split.drafted,
    availableCount: split.available.length,
    draftedCount: split.drafted.length,
    valueLabel: depleted ? "—" : band.valueLabel,
    shelfNote: depleted ? null : band.shelfNote,
    averageValueLabel:
      !depleted && math.valuedCount > 0
        ? formatCurrency(Math.round(math.averageRaw))
        : "—",
    cliffLabel: depleted
      ? "—"
      : formatCliffLabel(
          cliffRaw,
          Boolean(args.nextAvailablePlayers),
          math.isMinBidStyleTier,
          math.isFlatValueBand,
        ),
    topPlayerNames: sortPlayersForMobileTier(
      split.available,
      "auction_value",
      args.valuationsByPlayerId,
      args.draftedIds,
    )
      .slice(0, 3)
      .map((player) => player.name),
    positionCounts: countPositions(split.available),
    muted:
      args.muted === true ||
      depleted ||
      math.isMinBidStyleTier ||
      (math.isFlatValueBand && args.tier !== 1) ||
      args.tier === 5,
    depleted,
  };
}

export function buildMobileTierView(args: BuildMobileTierViewArgs): MobileTierView {
  const bands = resolveDisplayTierBands(args.leagueBudget);
  const groups = new Map<MobileDisplayTierNumber, Player[]>();
  const outsideModel: Player[] = [];

  for (const band of bands) {
    groups.set(band.tier, []);
  }

  for (const player of args.players) {
    const row = mapGetForPlayer(args.valuationsByPlayerId, player);
    const drafted = mobileTierPlayerIsDrafted(player, args.draftedIds);
    const raw = rawAuctionValueForTier(player, row);
    const displayValue = displayDollarsForPlayer(
      player,
      row,
      args.draftedIds,
      args.draftedPriceByPlayerId,
      args.draftedContractByPlayerId,
    );

    if (raw === null && !drafted) {
      outsideModel.push(player);
      continue;
    }

    const tier = displayTierForRaw(
      raw ?? displayValue ?? 0,
      args.leagueBudget,
    );

    groups.get(tier)!.push(player);
  }

  const nonEmptyBands = bands.filter((band) => {
    const players = groups.get(band.tier) ?? [];
    return players.length > 0;
  });

  const tierBuckets = nonEmptyBands.map((band, index) => {
    const players = groups.get(band.tier) ?? [];
    const nextBand = nonEmptyBands[index + 1];
    const nextPlayers = nextBand ? groups.get(nextBand.tier) ?? [] : undefined;
    const nextAvailablePlayers = nextPlayers
      ? splitByDraftStatus(nextPlayers, args.draftedIds).available
      : undefined;

    return buildBucket({
      tier: band.tier,
      title: `Tier ${band.tier}`,
      semanticLabel: band.label,
      shortRange: band.shortRange,
      players,
      draftedIds: args.draftedIds,
      valuationsByPlayerId: args.valuationsByPlayerId,
      leagueBudget: args.leagueBudget,
      nextAvailablePlayers,
    });
  });

  const outside =
    outsideModel.length > 0
      ? buildBucket({
          tier: "outside",
          title: "Outside valuation model",
          semanticLabel: "No Engine auction value",
          shortRange: null,
          players: outsideModel,
          draftedIds: args.draftedIds,
          valuationsByPlayerId: args.valuationsByPlayerId,
          leagueBudget: args.leagueBudget,
          muted: true,
        })
      : null;

  return {
    tiers: tierBuckets,
    outsideModel: outside,
    totalPlayers: args.players.length,
  };
}

export function sortPlayersForMobileTier(
  players: Player[],
  sortBy: MobileTierSortField,
  valuationsByPlayerId: ReadonlyMap<string, ValuationResult>,
  draftedIds: ReadonlySet<string>,
  draftedPriceByPlayerId?: ReadonlyMap<string, number>,
  draftedContractByPlayerId?: ReadonlyMap<string, string>,
): Player[] {
  return [...players].sort((a, b) => {
    const rowA = mapGetForPlayer(valuationsByPlayerId, a);
    const rowB = mapGetForPlayer(valuationsByPlayerId, b);

    function missingLastCompare(
      left: number | null,
      right: number | null,
      ascending: boolean,
    ): number {
      const leftMissing = left === null;
      const rightMissing = right === null;

      if (leftMissing && rightMissing) return 0;
      if (leftMissing) return 1;
      if (rightMissing) return -1;

      return ascending ? left - right : right - left;
    }

    if (sortBy === "auction_value") {
      const av = displayDollarsForPlayer(
        a,
        rowA,
        draftedIds,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
      );
      const bv = displayDollarsForPlayer(
        b,
        rowB,
        draftedIds,
        draftedPriceByPlayerId,
        draftedContractByPlayerId,
      );

      return missingLastCompare(av, bv, false);
    }

    if (sortBy === "auction_rank") {
      const ar =
        valuationNumber(rowA, "auction_rank") ??
        playerNumber(a, "auction_rank");
      const br =
        valuationNumber(rowB, "auction_rank") ??
        playerNumber(b, "auction_rank");

      const rankCompare = missingLastCompare(ar, br, true);

      if (rankCompare !== 0) return rankCompare;

      return missingLastCompare(
        rawAuctionValueForTier(a, rowA),
        rawAuctionValueForTier(b, rowB),
        false,
      );
    }

    if (sortBy === "market_adp") {
      const adpA =
        valuationNumber(rowA, "market_adp") ??
        playerNumber(a, "market_adp") ??
        finiteNumber(a.adp);
      const adpB =
        valuationNumber(rowB, "market_adp") ??
        playerNumber(b, "market_adp") ??
        finiteNumber(b.adp);

      const adpCompare = missingLastCompare(adpA, adpB, true);

      if (adpCompare !== 0) return adpCompare;

      return missingLastCompare(
        rawAuctionValueForTier(a, rowA),
        rawAuctionValueForTier(b, rowB),
        false,
      );
    }

    if (sortBy === "position") {
      const positionCompare = (a.position ?? "").localeCompare(b.position ?? "");

      if (positionCompare !== 0) return positionCompare;

      return missingLastCompare(
        rawAuctionValueForTier(a, rowA),
        rawAuctionValueForTier(b, rowB),
        false,
      );
    }

    if (sortBy === "recommended_bid") {
      const bidA =
        valuationNumber(rowA, "recommended_bid") ??
        playerNumber(a, "recommended_bid");
      const bidB =
        valuationNumber(rowB, "recommended_bid") ??
        playerNumber(b, "recommended_bid");

      return missingLastCompare(bidA, bidB, false);
    }

    const teamA =
      valuationNumber(rowA, "team_value") ??
      playerNumber(a, "team_value");
    const teamB =
      valuationNumber(rowB, "team_value") ??
      playerNumber(b, "team_value");

    return missingLastCompare(teamA, teamB, false);
  });
}

export function formatMobileTierAvailability(bucket: MobileTierBucket): string {
  if (bucket.availableCount === 0) {
    return bucket.draftedCount > 0
      ? `Depleted · ${bucket.draftedCount} drafted`
      : "Depleted";
  }

  if (bucket.draftedCount > 0) {
    return `${bucket.availableCount} left · ${bucket.draftedCount} drafted`;
  }

  return `${bucket.availableCount} left`;
}

