import type { Player } from "../types/player";
import { catalogPlayerIdInStringSet } from "./catalogPlayerKeys";
import { researchTableAuctionDollars } from "./researchDraftedDisplay";
import {
  formatCurrency,
  formatTierBandDisplay,
  formatTierValueRange,
  MEANINGFUL_BAND_FLOOR_RAW,
  type TierBandDisplay,
  type TierStats,
} from "../utils/tiers";
import { leagueWideAuctionDollars } from "../utils/valuation";

/** User-facing T1–T5 bands from raw auction dollars (display only; Engine tier unchanged). */
export const DISPLAY_TIER_BANDS = [
  {
    tier: 1,
    minInclusive: 25,
    maxExclusive: Number.POSITIVE_INFINITY,
    label: "Elite targets",
    shortRange: "$25+",
  },
  {
    tier: 2,
    minInclusive: 15,
    maxExclusive: 25,
    label: "Strong starters",
    shortRange: "$15–24",
  },
  {
    tier: 3,
    minInclusive: 10,
    maxExclusive: 15,
    label: "Starter targets",
    shortRange: "$10–14",
  },
  {
    tier: 4,
    minInclusive: 5,
    maxExclusive: 10,
    label: "Depth values",
    shortRange: "$5–9",
  },
  {
    tier: 5,
    minInclusive: 1,
    maxExclusive: 5,
    label: "Min-bid / reserve",
    shortRange: "$1–4",
  },
] as const;

export type DisplayTierNumber = (typeof DISPLAY_TIER_BANDS)[number]["tier"];

export type DisplayTierGroup = { tier: DisplayTierNumber; players: Player[] };

export const DISPLAY_TIER_SEMANTIC_LABELS: Record<DisplayTierNumber, string> =
  Object.fromEntries(
    DISPLAY_TIER_BANDS.map((b) => [b.tier, b.label]),
  ) as Record<DisplayTierNumber, string>;

export const DISPLAY_TIER_TOOLTIP =
  "Display tier from raw auction value bands ($25+, $15–24, $10–14, $5–9, $1–4). Cliffs and ranges use unrounded model dollars.";

export const ENGINE_TIER_METADATA_TOOLTIP =
  "Engine auction tier from valuation (may differ from the display tier above).";

function rawTierAuctionValueForDisplay(
  player: Pick<
    Player,
    "auction_value" | "valuation_eligible" | "recommended_bid" | "team_value"
  >,
): number | null {
  if (player.valuation_eligible === false) return null;
  const dollars = leagueWideAuctionDollars(player);
  return dollars === undefined ? null : dollars;
}

export function displayTierForRaw(raw: number): DisplayTierNumber {
  if (!Number.isFinite(raw)) return 5;
  if (raw >= 25) return 1;
  if (raw >= 15) return 2;
  if (raw >= 10) return 3;
  if (raw >= 5) return 4;
  return 5;
}

export function displayTierSemanticLabel(
  tier: string | number,
): string | null {
  const n = typeof tier === "number" ? tier : Number(tier);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return DISPLAY_TIER_SEMANTIC_LABELS[n as DisplayTierNumber] ?? null;
}

export function displayTierBandShortRange(tier: string | number): string | null {
  const n = typeof tier === "number" ? tier : Number(tier);
  const band = DISPLAY_TIER_BANDS.find((b) => b.tier === n);
  return band?.shortRange ?? null;
}

export type DisplayTierGroupingOptions = {
  draftedIds?: ReadonlySet<string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
};

function isDrafted(
  player: Pick<Player, "id" | "mlbId">,
  draftedIds: ReadonlySet<string> | undefined,
): boolean {
  return draftedIds != null && catalogPlayerIdInStringSet(draftedIds, player);
}

/** Raw dollars used only to pick a display tier bucket (not for tier summary stats). */
export function displayTierGroupingRaw(
  player: Player,
  options?: DisplayTierGroupingOptions,
): number | null {
  const model = rawTierAuctionValueForDisplay(player);
  if (model != null) return displayTierForRaw(model);

  if (isDrafted(player, options?.draftedIds)) {
    const paid = researchTableAuctionDollars(player, options);
    if (paid != null && paid > 0) return displayTierForRaw(paid);
  }

  return null;
}

export function groupPlayersByDisplayTier(
  players: readonly Player[],
  options?: DisplayTierGroupingOptions,
): DisplayTierGroup[] {
  const map = new Map<number, Player[]>();
  for (const band of DISPLAY_TIER_BANDS) {
    map.set(band.tier, []);
  }

  for (const p of players) {
    const tier = displayTierGroupingRaw(p, options);
    if (tier == null) continue;
    map.get(tier)!.push(p);
  }

  return DISPLAY_TIER_BANDS.map((b) => ({
    tier: b.tier,
    players: map.get(b.tier) ?? [],
  })).filter((g) => g.players.length > 0);
}

export function engineAuctionTierNumber(
  player: Pick<Player, "auction_tier" | "catalog_tier">,
): number | null {
  const t =
    (typeof player.auction_tier === "number" && Number.isFinite(player.auction_tier)
      ? player.auction_tier
      : undefined) ??
    (typeof player.catalog_tier === "number" && Number.isFinite(player.catalog_tier)
      ? player.catalog_tier
      : undefined);
  if (t == null) return null;
  const n = typeof t === "number" ? t : Number(t);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** Whole-dollar ceiling for a display tier band (e.g. T5 → $4). */
export function displayTierMaxWholeDollar(tier: DisplayTierNumber): number | null {
  const band = DISPLAY_TIER_BANDS.find((b) => b.tier === tier);
  if (!band || !Number.isFinite(band.maxExclusive)) return null;
  return band.maxExclusive - 1;
}

/** Whole-dollar floor for a display tier band (e.g. T1 → $25). */
export function displayTierMinWholeDollar(tier: DisplayTierNumber): number {
  return DISPLAY_TIER_BANDS.find((b) => b.tier === tier)?.minInclusive ?? 1;
}

/**
 * Collapsed value column for a display tier — clamps rounded dollars to the
 * configured band so T5 never shows "$4–$5" when raw values round up.
 */
export function formatDisplayTierBandDisplay(
  displayTier: DisplayTierNumber,
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
    return formatTierBandDisplay(stat);
  }

  const bandMax = displayTierMaxWholeDollar(displayTier);
  const bandMin = displayTierMinWholeDollar(displayTier);
  const maxCapped =
    bandMax != null ? Math.min(stat.maxValueDisplay, bandMax) : stat.maxValueDisplay;
  const minCapped = Math.max(stat.minValueDisplay, bandMin);

  const showCoreBand =
    stat.shelvedCount > 0 &&
    stat.minCoreValueDisplay >= MEANINGFUL_BAND_FLOOR_RAW &&
    stat.minCoreValueDisplay > stat.minValueDisplay;

  const coreMin = showCoreBand
    ? Math.max(stat.minCoreValueDisplay, bandMin)
    : minCapped;
  const coreMax = maxCapped;

  if (displayTier === 5 && showCoreBand && stat.shelvedCount > 0) {
    const shelfNote =
      stat.shelvedCount === 1 ? "1 min-bid" : `${stat.shelvedCount} min-bid`;
    if (coreMin === coreMax) {
      return { rangeLabel: `${formatCurrency(coreMax)} max`, shelfNote };
    }
    return {
      rangeLabel: formatTierValueRange(coreMin, coreMax),
      shelfNote,
    };
  }

  if (maxCapped < MEANINGFUL_BAND_FLOOR_RAW) {
    return formatTierBandDisplay(stat);
  }

  const rangeLabel = formatTierValueRange(
    showCoreBand ? coreMin : minCapped,
    maxCapped,
  );
  const shelfNote =
    showCoreBand && stat.shelvedCount > 0
      ? displayTier === 5
        ? stat.shelvedCount === 1
          ? "1 min-bid"
          : `${stat.shelvedCount} min-bid`
        : stat.shelvedCount === 1
          ? "1 at min bid"
          : `+${stat.shelvedCount} at min bid`
      : null;

  return { rangeLabel, shelfNote };
}

export function shouldShowEngineTierMetadata(
  player: Player,
  displayTier: string | number,
): boolean {
  const engine = engineAuctionTierNumber(player);
  if (engine == null) return false;
  const display =
    typeof displayTier === "number" ? displayTier : Number(displayTier);
  return Number.isFinite(display) && engine !== display;
}
