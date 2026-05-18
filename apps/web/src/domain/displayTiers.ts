import type { ValuationResult } from "../api/engine";
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
import {
  bandForDisplayTier,
  displayTierForRawWithConfig,
  REFERENCE_AUCTION_BUDGET,
  resolveDisplayTierConfig,
  userFacingTierTooltip,
  type DisplayTierConfig,
  type DisplayTierNumber,
  type ResolvedDisplayTierBand,
} from "./displayTierThresholds";

export type { DisplayTierConfig, DisplayTierNumber, ResolvedDisplayTierBand };
export {
  DISPLAY_TIER_BAND_SPECS,
  REFERENCE_AUCTION_BUDGET,
  resolveDisplayTierConfig,
  scaleTierDollarThreshold,
  userFacingTierTooltip,
} from "./displayTierThresholds";

/** Default ($260) resolved bands — use {@link resolveDisplayTierConfig} when league budget is known. */
export const DISPLAY_TIER_BANDS: readonly ResolvedDisplayTierBand[] =
  resolveDisplayTierConfig().bands;

export type DisplayTierGroup = { tier: DisplayTierNumber; players: Player[] };

export const DISPLAY_TIER_SEMANTIC_LABELS: Record<DisplayTierNumber, string> =
  Object.fromEntries(
    DISPLAY_TIER_BANDS.map((b) => [b.tier, b.label]),
  ) as Record<DisplayTierNumber, string>;

/** Default ($260) tooltip — prefer {@link userFacingTierTooltip} with league budget when available. */
export const USER_FACING_TIER_TOOLTIP = userFacingTierTooltip();

/** @deprecated Use {@link USER_FACING_TIER_TOOLTIP} or {@link userFacingTierTooltip}. */
export const DISPLAY_TIER_TOOLTIP = USER_FACING_TIER_TOOLTIP;

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

function tierConfigFromOptions(
  options?: DisplayTierGroupingOptions,
): DisplayTierConfig {
  return resolveDisplayTierConfig(options?.leagueBudget);
}

export function displayTierForRaw(
  raw: number,
  config?: DisplayTierConfig,
): DisplayTierNumber {
  return displayTierForRawWithConfig(raw, config);
}

/** Raw league auction dollars for tier assignment (never rounded). */
export function rawAuctionValueForUserFacingTier(
  player: Pick<
    Player,
    | "auction_value"
    | "valuation_eligible"
    | "recommended_bid"
    | "team_value"
  >,
  valuationRow?: Pick<ValuationResult, "auction_value"> | null,
): number | null {
  if (valuationRow != null) {
    const rowVal = valuationRow.auction_value;
    if (typeof rowVal === "number" && Number.isFinite(rowVal)) {
      return rowVal;
    }
  }
  return rawTierAuctionValueForDisplay(player);
}

/**
 * Canonical user-facing T1–T5 for any surface (Research, Command Center, tables).
 * Uses raw `auction_value`; optional valuation row wins when merged on the player object lags.
 */
export function userFacingDisplayTier(
  player: Player,
  options?: DisplayTierGroupingOptions & {
    valuationRow?: Pick<ValuationResult, "auction_value"> | null;
  },
): DisplayTierNumber | undefined {
  const fromPlayer = displayTierGroupingRaw(player, options);
  if (fromPlayer != null) return fromPlayer;
  const raw = rawAuctionValueForUserFacingTier(player, options?.valuationRow);
  if (raw == null) return undefined;
  const config = tierConfigFromOptions(options);
  return displayTierForRaw(raw, config);
}

/** Undrafted pool tier for market counts (model dollars only, not sale price). */
export function userFacingDisplayTierForAvailablePlayer(
  player: Player,
  leagueBudget?: number,
): DisplayTierNumber | undefined {
  const raw = rawTierAuctionValueForDisplay(player);
  if (raw == null) return undefined;
  return displayTierForRaw(raw, resolveDisplayTierConfig(leagueBudget));
}

/**
 * Position-market tier bucket: prefer Engine board `auction_value` when the catalog
 * player row has not been merged yet (Command Center left panel).
 */
export function userFacingDisplayTierForMarketPlayer(
  player: Player,
  options?: {
    leagueBudget?: number;
    engineAuctionValueByPlayerId?: ReadonlyMap<string, number>;
  },
): DisplayTierNumber | undefined {
  const engineVal = options?.engineAuctionValueByPlayerId?.get(player.id);
  const raw =
    typeof engineVal === "number" && Number.isFinite(engineVal)
      ? engineVal
      : rawTierAuctionValueForDisplay(player);
  if (raw == null) return undefined;
  return displayTierForRaw(raw, resolveDisplayTierConfig(options?.leagueBudget));
}

export function displayTierSemanticLabel(
  tier: string | number,
): string | null {
  const n = typeof tier === "number" ? tier : Number(tier);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return DISPLAY_TIER_SEMANTIC_LABELS[n as DisplayTierNumber] ?? null;
}

export function displayTierBandShortRange(
  tier: string | number,
  leagueBudget?: number,
): string | null {
  const n = typeof tier === "number" ? tier : Number(tier);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return bandForDisplayTier(n as DisplayTierNumber, resolveDisplayTierConfig(leagueBudget))
    ?.shortRange ?? null;
}

export type DisplayTierGroupingOptions = {
  draftedIds?: ReadonlySet<string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
  /** League auction budget; defaults to {@link REFERENCE_AUCTION_BUDGET} ($260). */
  leagueBudget?: number;
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
): DisplayTierNumber | null {
  const config = tierConfigFromOptions(options);
  const model = rawTierAuctionValueForDisplay(player);
  if (model != null) return displayTierForRaw(model, config);

  if (isDrafted(player, options?.draftedIds)) {
    const paid = researchTableAuctionDollars(player, options);
    if (paid != null && paid > 0) return displayTierForRaw(paid, config);
  }

  return null;
}

export function groupPlayersByDisplayTier(
  players: readonly Player[],
  options?: DisplayTierGroupingOptions,
): DisplayTierGroup[] {
  const config = tierConfigFromOptions(options);
  const map = new Map<number, Player[]>();
  for (const band of config.bands) {
    map.set(band.tier, []);
  }

  for (const p of players) {
    const tier = displayTierGroupingRaw(p, options);
    if (tier == null) continue;
    map.get(tier)!.push(p);
  }

  return config.bands
    .map((b) => ({
      tier: b.tier,
      players: map.get(b.tier) ?? [],
    }))
    .filter((g) => g.players.length > 0);
}

/** Engine `auction_tier` only (rank bucket metadata — not user-facing T1–T5). */
export function engineAuctionTierNumber(
  player: Pick<Player, "auction_tier">,
): number | null {
  const t = player.auction_tier;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  return t >= 1 && t <= 5 ? t : null;
}

/** Whole-dollar ceiling for a display tier band (e.g. T5 → $4). */
export function displayTierMaxWholeDollar(
  tier: DisplayTierNumber,
  leagueBudget?: number,
): number | null {
  const band = bandForDisplayTier(tier, resolveDisplayTierConfig(leagueBudget));
  if (!band || !Number.isFinite(band.maxExclusive)) return null;
  return band.maxExclusive - 1;
}

/** Whole-dollar floor for a display tier band (e.g. T1 → $25). */
export function displayTierMinWholeDollar(
  tier: DisplayTierNumber,
  leagueBudget?: number,
): number {
  return (
    bandForDisplayTier(tier, resolveDisplayTierConfig(leagueBudget))?.minInclusive ??
    1
  );
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
  leagueBudget?: number,
): TierBandDisplay {
  if (stat.valuedPlayerCount === 0) {
    return formatTierBandDisplay(stat);
  }

  const bandMax = displayTierMaxWholeDollar(displayTier, leagueBudget);
  const bandMin = displayTierMinWholeDollar(displayTier, leagueBudget);
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
