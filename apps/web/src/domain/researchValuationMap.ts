import type { ValuationShape } from "../utils/valuation";

/**
 * Build a `player_id → valuation row` map from the engine board response.
 * Skips **custom** player ids so `mergeCatalogPlayersWithValuations` does not
 * expect engine rows for user-created players.
 */
export function researchValuationRowMapFromEngine(
  valuations: readonly ValuationShape[],
  customPlayerIds: ReadonlySet<string>,
): Map<string, ValuationShape> {
  const merged = new Map<string, ValuationShape>();
  for (const row of valuations) {
    if (customPlayerIds.has(row.player_id)) continue;
    merged.set(row.player_id, row);
  }
  return merged;
}
