export type TierValueOverride = {
  tier: number;
  value: number;
};

export function getEffectiveTierValue(
  playerId: string,
  fallback: TierValueOverride,
  overrides?: ReadonlyMap<string, TierValueOverride>,
): TierValueOverride {
  const fromEngine = overrides?.get(playerId);
  if (!fromEngine) return fallback;
  return {
    tier: Number.isFinite(fromEngine.tier) ? fromEngine.tier : fallback.tier,
    value: Number.isFinite(fromEngine.value) ? fromEngine.value : fallback.value,
  };
}
