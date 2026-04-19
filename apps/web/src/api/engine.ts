import { authHeaders, requestJson } from "./client";

// ─── /api/engine/leagues/:leagueId/valuation ──────────────────────────────────

export interface ValuationResult {
  player_id: string;
  name: string;
  position: string;
  tier: number;
  baseline_value: number;
  adjusted_value: number;
  indicator: "Steal" | "Reach" | "Fair Value";
  /** Engine explainability; safe to ignore in UI. */
  why?: string[];
  /** When Engine sends catalog-style ADP on the valuation row. */
  adp?: number;
  inflation_factor?: number;
  team?: string;
}

export interface ValuationResponse {
  inflation_factor: number;
  total_budget_remaining: number;
  pool_value_remaining: number;
  players_remaining: number;
  valuations: ValuationResult[];
  calculated_at: string;
  /** Present when Engine includes contract version on inflation payloads. */
  engine_contract_version?: string;
  /** Response-level league context from Engine (inflation, scarcity, monopolies). */
  market_notes?: string[];
}

export async function getValuation(
  leagueId: string,
  token: string,
): Promise<ValuationResponse> {
  return requestJson<ValuationResponse>(
    `/api/engine/leagues/${leagueId}/valuation`,
    { method: "POST", headers: authHeaders(token) },
    "Valuation request failed",
  );
}

/** Same envelope as full valuation plus focused `player` row from Engine. */
export type ValuationPlayerResponse = ValuationResponse & {
  player?: ValuationResult;
};

export async function getValuationPlayer(
  leagueId: string,
  token: string,
  playerId: string,
): Promise<ValuationPlayerResponse> {
  return requestJson<ValuationPlayerResponse>(
    `/api/engine/leagues/${leagueId}/valuation/player`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ player_id: playerId }),
    },
    "Valuation (player) request failed",
  );
}

export interface CatalogBatchValuesRequest {
  player_ids: string[];
  league_scope?: "Mixed" | "AL" | "NL";
  pos_eligibility_threshold?: number;
}

export interface CatalogBatchPlayer {
  player_id: string;
  name: string;
  position: string;
  team: string;
  value: number;
  tier: number;
  adp: number;
}

export interface CatalogBatchValuesResponse {
  engine_contract_version: string;
  players: CatalogBatchPlayer[];
}

export async function getCatalogBatchValues(
  token: string,
  body: CatalogBatchValuesRequest,
): Promise<CatalogBatchValuesResponse> {
  return requestJson<CatalogBatchValuesResponse>(
    "/api/engine/catalog/batch-values",
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    "Catalog batch values request failed",
  );
}

// ─── /api/engine/leagues/:leagueId/scarcity ───────────────────────────────────
// Optional query param: position (e.g. "SS")

export interface ScarcityPosition {
  position: string;
  elite_remaining: number;
  mid_tier_remaining: number;
  total_remaining: number;
  scarcity_score: number; // 0–100, higher = more scarce
  alert: string;
}

export interface MonopolyWarning {
  team_id: string;
  category: string;
  share_percentage: number;
  message: string;
}

export interface ScarcityResponse {
  positions: ScarcityPosition[];
  monopoly_warnings: MonopolyWarning[];
}

export async function getScarcity(
  leagueId: string,
  token: string,
  position?: string,
): Promise<ScarcityResponse> {
  const qs = position ? `?position=${encodeURIComponent(position)}` : "";
  return requestJson<ScarcityResponse>(
    `/api/engine/leagues/${leagueId}/scarcity${qs}`,
    { method: "POST", headers: authHeaders(token) },
    "Scarcity request failed",
  );
}

// ─── /api/engine/leagues/:leagueId/mock-pick ──────────────────────────────────

export interface PredictedPlayer {
  player_id: string;
  name: string;
  position: string;
  adp: number;
  reason: string;
}

export interface MockPickPrediction {
  team_id: string;
  pick_position: number;
  confidence: number; // 0–1
  predicted_player: PredictedPlayer;
}

export interface MockPickResponse {
  predictions: MockPickPrediction[];
}

export async function getMockPick(
  leagueId: string,
  token: string,
  budgetByTeamId?: Record<string, number>,
  availablePlayerIds?: string[],
): Promise<MockPickResponse> {
  return requestJson<MockPickResponse>(
    `/api/engine/leagues/${leagueId}/mock-pick`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ budgetByTeamId, availablePlayerIds }),
    },
    "Mock-pick request failed",
  );
}

// ─── /api/engine/signals/news ─────────────────────────────────────────────────

export interface NewsSignal {
  player_id?: string; // present when matched to a DB player
  player_name: string;
  signal_type: string;
  severity: "low" | "medium" | "high";
  description: string;
  effective_date: string;
  source: string;
}

export interface NewsSignalsResponse {
  signals: NewsSignal[];
  count: number;
}

export async function getNewsSignals(
  token: string,
  options?: { days?: number; signal_type?: string },
): Promise<NewsSignalsResponse> {
  const params = new URLSearchParams();
  if (options?.days) params.set("days", String(options.days));
  if (options?.signal_type) params.set("signal_type", options.signal_type);
  const qs = params.size > 0 ? "?" + params.toString() : "";
  return requestJson<NewsSignalsResponse>(
    `/api/engine/signals/news${qs}`,
    {
      headers: authHeaders(token),
    },
    "News signals request failed",
  );
}
