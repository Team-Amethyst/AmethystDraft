export type DisplayTierNumber = 1 | 2 | 3 | 4 | 5;

/** Reference auction budget the default dollar bands were designed for. */
export const REFERENCE_AUCTION_BUDGET = 260;

export type DisplayTierBandSpec = {
  tier: DisplayTierNumber;
  label: string;
  referenceMinInclusive: number;
  referenceMaxExclusive: number;
};

/**
 * Default band shape at {@link REFERENCE_AUCTION_BUDGET}.
 * Internally scaled by `referenceMin / REFERENCE_AUCTION_BUDGET * leagueBudget`
 * (rounded whole dollars). UI always shows dollars, never percentages.
 */
export const DISPLAY_TIER_BAND_SPECS: readonly DisplayTierBandSpec[] = [
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
] as const;

export type ResolvedDisplayTierBand = {
  tier: DisplayTierNumber;
  label: string;
  minInclusive: number;
  maxExclusive: number;
  shortRange: string;
};

export type DisplayTierConfig = {
  leagueBudget: number;
  referenceBudget: number;
  bands: readonly ResolvedDisplayTierBand[];
  /** Raw values below this floor map to T5. */
  minBidFloor: number;
};

export function scaleTierDollarThreshold(
  referenceDollars: number,
  leagueBudget: number,
  referenceBudget: number = REFERENCE_AUCTION_BUDGET,
): number {
  if (!Number.isFinite(referenceDollars) || referenceDollars <= 0) return 1;
  if (!Number.isFinite(leagueBudget) || leagueBudget <= 0) return referenceDollars;
  if (!Number.isFinite(referenceBudget) || referenceBudget <= 0) {
    return Math.max(1, Math.round(referenceDollars));
  }
  return Math.max(1, Math.round((referenceDollars / referenceBudget) * leagueBudget));
}

export function formatDisplayTierDollarRange(
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

const configCache = new Map<number, DisplayTierConfig>();

export function resolveDisplayTierConfig(leagueBudget?: number): DisplayTierConfig {
  const budget =
    typeof leagueBudget === "number" &&
    Number.isFinite(leagueBudget) &&
    leagueBudget > 0
      ? leagueBudget
      : REFERENCE_AUCTION_BUDGET;

  const cached = configCache.get(budget);
  if (cached) return cached;

  const bands: ResolvedDisplayTierBand[] = DISPLAY_TIER_BAND_SPECS.map(
    (spec) => {
      const minInclusive = scaleTierDollarThreshold(
        spec.referenceMinInclusive,
        budget,
      );
      const maxExclusive =
        spec.referenceMaxExclusive === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : scaleTierDollarThreshold(spec.referenceMaxExclusive, budget);
      return {
        tier: spec.tier,
        label: spec.label,
        minInclusive,
        maxExclusive,
        shortRange: formatDisplayTierDollarRange(minInclusive, maxExclusive),
      };
    },
  );

  const config: DisplayTierConfig = {
    leagueBudget: budget,
    referenceBudget: REFERENCE_AUCTION_BUDGET,
    bands,
    minBidFloor: scaleTierDollarThreshold(1, budget),
  };
  configCache.set(budget, config);
  return config;
}

/** User-facing tooltip; mentions budget scaling only as context, not % labels. */
export function userFacingTierTooltip(config?: DisplayTierConfig): string {
  const cfg = config ?? resolveDisplayTierConfig();
  const ranges = cfg.bands.map((b) => b.shortRange).join(", ");
  if (cfg.leagueBudget === REFERENCE_AUCTION_BUDGET) {
    return `Auction value tier from raw Engine dollars (${ranges}). Assignment uses unrounded values.`;
  }
  return `Auction value tier from raw Engine dollars (${ranges}). Bands scale to a $${cfg.leagueBudget} league budget; assignment uses unrounded values.`;
}

export function displayTierForRawWithConfig(
  raw: number,
  config?: DisplayTierConfig,
): DisplayTierNumber {
  const cfg = config ?? resolveDisplayTierConfig();
  if (!Number.isFinite(raw) || raw < cfg.minBidFloor) return 5;
  for (const band of cfg.bands) {
    if (raw >= band.minInclusive) return band.tier;
  }
  return 5;
}

export function bandForDisplayTier(
  tier: DisplayTierNumber,
  config?: DisplayTierConfig,
): ResolvedDisplayTierBand | undefined {
  const cfg = config ?? resolveDisplayTierConfig();
  return cfg.bands.find((b) => b.tier === tier);
}
