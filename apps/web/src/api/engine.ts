import { requireAuthHeaders, requestJson, requestJsonParsed } from "./client";
import {
  findRawValuationEntry,
  normalizeValuationPlayerResponseBody,
  normalizeValuationResponseBody,
  rawValuationRowPipelineSnapshot,
  valuationRowPipelineSnapshot,
} from "./valuationNormalize";

// ─── /api/engine/leagues/:leagueId/valuation ──────────────────────────────────

export interface ValuationResult {
  player_id: string;
  name: string;
  position: string;
  tier: number;
  baseline_value: number;
  adjusted_value: number;
  recommended_bid?: number;
  team_adjusted_value?: number;
  /** Optional engine-provided edge vs. recommended bid (UI may derive if absent). */
  edge?: number;
  /** When Engine includes roster-need adjustment (optional; debug / future UI). */
  positional_need_multiplier?: number;
  /** When Engine includes budget-pressure adjustment (optional; debug / future UI). */
  budget_pressure_multiplier?: number;
  inflation_model?: "replacement_slots_v2";
  indicator: "Steal" | "Reach" | "Fair Value";
  /** Engine explainability; safe to ignore in UI. */
  why?: string[];
  /** When Engine sends catalog-style ADP on the valuation row. */
  adp?: number;
  inflation_factor?: number;
  team?: string;
  baseline_components?: Record<string, unknown>;
  scarcity_adjustment?: number;
  inflation_adjustment?: number;
  explain_v2?: {
    indicator: "Steal" | "Reach" | "Fair Value";
    auction_target: number;
    list_value: number;
    adjustments: {
      scarcity: number;
      inflation: number;
      other: number;
    };
    drivers: Array<{
      label: string;
      impact: number;
      reason: string;
    }>;
    confidence: number;
  };
}

export interface ValuationContextV2 {
  schema_version: "2";
  calculated_at: string;
  scope: {
    league_id: string;
    player_id?: string;
    position?: string;
  };
  market_summary: {
    headline: string;
    inflation_factor: number;
    inflation_percent_vs_neutral: number;
    budget_left: number;
    players_left: number;
    model_version: string;
  };
  position_alerts: Array<{
    position: string;
    severity: "low" | "medium" | "high" | "critical";
    urgency_score: number;
    message: string;
    evidence: {
      elite_remaining: number;
      mid_tier_remaining: number;
      total_remaining: number;
    };
    recommended_action: string;
  }>;
  assumptions: string[];
  confidence: {
    overall: number;
    notes?: string;
  };
}

export interface ValuationResponse {
  inflation_factor: number;
  total_budget_remaining: number;
  pool_value_remaining: number;
  players_remaining: number;
  /** Optional Engine fields (when present on JSON; used for diagnostics / UI copy). */
  remaining_slots?: number;
  players_left?: number;
  draftable_pool_size?: number;
  inflation_raw?: number;
  inflation_bounded_by?: string;
  valuations: ValuationResult[];
  calculated_at: string;
  /** Present when Engine includes contract version on inflation payloads. */
  engine_contract_version?: string;
  /** Engine valuation model label when present (e.g. v2-expert-manual-shape). */
  valuation_model_version?: string;
  /** Response-level league context from Engine (inflation, scarcity, monopolies). */
  market_notes?: string[];
  /** Structured explainability payload (v2, additive). */
  context_v2?: ValuationContextV2;
}

function logDraftroomValuationPipeline(
  route: string,
  raw: unknown,
  normalized: ValuationResponse,
  focusPlayerId?: string,
): void {
  if (!import.meta.env.DEV) return;
  const focus = focusPlayerId?.trim();
  const rawRow = focus ? findRawValuationEntry(raw, focus) : undefined;
  const normRow = focus
    ? normalized.valuations.find(
        (v) => String(v.player_id).trim() === focus,
      )
    : undefined;
  console.info("[valuation pipeline]", {
    source: "api_client_http",
    route,
    selected_player_id: focus ?? null,
    A_board_raw_row: rawValuationRowPipelineSnapshot(rawRow),
    B_getValuation_normalized_row: valuationRowPipelineSnapshot(normRow),
    valuations_len: normalized.valuations.length,
  });
}

export async function getValuation(
  leagueId: string,
  token: string,
  userTeamId = "team_1",
  /** When set (e.g. selected Draftroom player), DEV logs raw vs normalized row for that id. */
  devLogFocusPlayerId?: string | null,
): Promise<ValuationResponse> {
  return requestJsonParsed<ValuationResponse>(
    `/api/engine/leagues/${leagueId}/valuation`,
    {
      method: "POST",
      headers: requireAuthHeaders(token),
      body: JSON.stringify({
        user_team_id: userTeamId,
        inflation_model: "replacement_slots_v2",
      }),
    },
    "Valuation request failed",
    (raw) => {
      const normalized = normalizeValuationResponseBody(raw);
      logDraftroomValuationPipeline(
        "POST /valuation (board)",
        raw,
        normalized,
        devLogFocusPlayerId ?? undefined,
      );
      return normalized;
    },
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
  userTeamId = "team_1",
): Promise<ValuationPlayerResponse> {
  const pid = String(playerId).trim();
  return requestJsonParsed<ValuationPlayerResponse>(
    `/api/engine/leagues/${leagueId}/valuation/player`,
    {
      method: "POST",
      headers: requireAuthHeaders(token),
      body: JSON.stringify({
        player_id: playerId,
        user_team_id: userTeamId,
        inflation_model: "replacement_slots_v2",
      }),
    },
    "Valuation (player) request failed",
    (raw) => {
      const normalized = normalizeValuationPlayerResponseBody(raw);
      if (!import.meta.env.DEV) return normalized;
      const rawRow =
        findRawValuationEntry(raw, pid) ??
        (raw &&
        typeof raw === "object" &&
        (raw as Record<string, unknown>).player &&
        typeof (raw as Record<string, unknown>).player === "object"
          ? (raw as Record<string, unknown>).player
          : undefined);
      const normRow =
        normalized.player ??
        normalized.valuations.find((v) => String(v.player_id).trim() === pid);
      console.info("[valuation pipeline]", {
        source: "api_client_http",
        route: "POST /api/engine/leagues/:leagueId/valuation/player",
        selected_player_id: pid,
        C_player_raw_row: rawValuationRowPipelineSnapshot(rawRow),
        D_getValuationPlayer_normalized_row: valuationRowPipelineSnapshot(normRow),
      });
      return normalized;
    },
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
      headers: requireAuthHeaders(token),
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
  depth_remaining?: number;
  total_remaining: number;
  scarcity_score: number; // 0–100, higher = more scarce
  alert: string;
}

export interface ScarcityTierBucket {
  tier: "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5";
  remaining: number;
  urgency_score: number;
  message?: string;
  recommended_action?: string;
}

export interface ScarcityTierBucketsByPosition {
  position: string;
  buckets: ScarcityTierBucket[];
}

export interface MonopolyWarning {
  team_id: string;
  category: string;
  share_percentage: number;
  message: string;
}

export interface ScarcityResponse {
  engine_contract_version?: string;
  schema_version?: "2";
  calculated_at?: string;
  selected_position?: string;
  selected_position_explainer?: {
    severity: "low" | "medium" | "high" | "critical";
    urgency_score: number;
    message: string;
    recommended_action: string;
  } | null;
  tier_buckets?: ScarcityTierBucketsByPosition[];
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
    { method: "POST", headers: requireAuthHeaders(token) },
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
      headers: requireAuthHeaders(token),
      body: JSON.stringify({ budgetByTeamId, availablePlayerIds }),
    },
    "Mock-pick request failed",
  );
}

// ─── /api/engine/signals/news ─────────────────────────────────────────────────

export type NewsSignalType =
  | "injury"
  | "role_change"
  | "trade"
  | "demotion"
  | "promotion";

export interface NewsSignal {
  player_id?: string; // present when matched to a DB player
  player_name: string;
  signal_type: NewsSignalType;
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
  options?: { days?: number; signal_type?: NewsSignalType },
): Promise<NewsSignalsResponse> {
  const params = new URLSearchParams();
  if (options?.days) params.set("days", String(options.days));
  if (options?.signal_type) params.set("signal_type", options.signal_type);
  const qs = params.size > 0 ? "?" + params.toString() : "";
  return requestJson<NewsSignalsResponse>(
    `/api/engine/signals/news${qs}`,
    {
      headers: requireAuthHeaders(token),
    },
    "News signals request failed",
  );
}
