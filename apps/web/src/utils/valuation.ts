import type { Player } from "../types/player";

export type ValuationSortField =
  | "team_adjusted_value"
  | "recommended_bid"
  | "adjusted_value"
  | "baseline_value";

export interface ValuationShape {
  player_id: string;
  baseline_value?: number;
  adjusted_value?: number;
  recommended_bid?: number;
  team_adjusted_value?: number;
  inflation_model?: "replacement_slots_v2";
  indicator?: "Steal" | "Reach" | "Fair Value";
  explain_v2?: Player["explain_v2"];
  why?: string[];
  market_notes?: string[];
}

export const VALUATION_FALLBACK_ORDER: ValuationSortField[] = [
  "team_adjusted_value",
  "recommended_bid",
  "adjusted_value",
  "baseline_value",
];

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function resolveValuationNumber(
  player: Pick<
    Player,
    | "value"
    | "baseline_value"
    | "adjusted_value"
    | "recommended_bid"
    | "team_adjusted_value"
  >,
  preferredField?: ValuationSortField,
): number {
  if (preferredField) {
    const preferredValue = coerceNumber(player[preferredField]);
    if (preferredValue !== undefined) return preferredValue;
  }
  for (const field of VALUATION_FALLBACK_ORDER) {
    const candidate = coerceNumber(player[field]);
    if (candidate !== undefined) return candidate;
  }
  return coerceNumber(player.value) ?? 0;
}

export function mergePlayerWithValuation(
  player: Player,
  valuation?: ValuationShape,
): Player {
  if (!valuation) return player;
  return {
    ...player,
    baseline_value: coerceNumber(valuation.baseline_value) ?? player.baseline_value,
    adjusted_value: coerceNumber(valuation.adjusted_value) ?? player.adjusted_value,
    recommended_bid:
      coerceNumber(valuation.recommended_bid) ?? player.recommended_bid,
    team_adjusted_value:
      coerceNumber(valuation.team_adjusted_value) ?? player.team_adjusted_value,
    inflation_model: valuation.inflation_model ?? player.inflation_model,
    indicator: valuation.indicator ?? player.indicator,
    explain_v2: valuation.explain_v2 ?? player.explain_v2,
    why: valuation.why ?? player.why,
    market_notes: valuation.market_notes ?? player.market_notes,
  };
}

export function mergeCatalogPlayersWithValuations(
  players: Player[],
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): Player[] {
  if (valuationsByPlayerId.size === 0) return players;
  return players.map((player) =>
    mergePlayerWithValuation(player, valuationsByPlayerId.get(player.id)),
  );
}

export function valuationSortLabel(field: ValuationSortField): string {
  if (field === "team_adjusted_value") return "Your Value";
  if (field === "recommended_bid") return "Likely Bid";
  if (field === "adjusted_value") return "Market Value";
  return "Player Strength";
}

export function valuationTooltip(field: ValuationSortField): string {
  if (field === "team_adjusted_value") {
    return "Personalized value based on your roster needs and budget.";
  }
  if (field === "recommended_bid") {
    return "General auction guidance based on player strength and market conditions.";
  }
  if (field === "adjusted_value") {
    return "Model value based on remaining roster slots, replacement levels, and league budget.";
  }
  return "League-adjusted player value before auction context.";
}

export function defaultValuationSortForPage(
  page: "Research" | "MyDraft" | "AuctionCenter" | "CommandCenter",
): ValuationSortField {
  if (page === "Research") return "recommended_bid";
  if (page === "CommandCenter") return "adjusted_value";
  return "team_adjusted_value";
}
