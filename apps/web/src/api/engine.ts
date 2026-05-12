import { requireAuthHeaders, requestJson } from "./client";
import {
  executeBoardValuationRequest,
  executePlayerValuationRequest,
} from "./engineValuationInternal";
import {
  fetchBoardValuationWithCache,
  fetchPlayerValuationWithCache,
  type ValuationBoardCacheContext,
} from "./valuationCache";
export type { ValuationBoardCacheContext } from "./valuationCache";

// ─── /api/engine/leagues/:leagueId/valuation ──────────────────────────────────

export interface ValuationResult {
  player_id: string;
  name: string;
  position: string;
  /**
   * Legacy Engine field: tier by auction value within this valuation response.
   * Prefer `auction_tier` when present; normalized rows mirror into both.
   */
  tier: number;
  /** Tier by auction value (canonical). */
  auction_tier?: number;
  /** Tier by baseline strength (pre-auction economics). */
  baseline_tier?: number;
  /** Rank by league auction value among pool in this response. */
  auction_rank?: number;
  /** Rank by baseline strength. */
  baseline_rank?: number;
  /** External average draft position when Engine attaches a real market source. */
  market_adp?: number;
  market_adp_source?: string;
  market_adp_updated_at?: string;
  market_adp_min?: number;
  market_adp_max?: number;
  market_pick_count?: number;
  baseline_value: number;
  /** League-wide canonical auction dollars when Engine sends it (else infer from adjusted_value). */
  auction_value?: number;
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
  /**
   * Legacy mirror of {@link auction_rank} when present after normalization.
   * Raw Engine `adp` on a row is catalog-style ADP — do not use it as auction_rank (see normalize).
   */
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
  /** Row-level Engine explainability (present when `explain_valuation_rows` was requested). */
  valuation_explain?: ValuationExplain;
  /** Short copy clarifying recommended_bid semantics when Engine sends it. */
  recommended_bid_note?: string;
  /** Short copy clarifying edge vs bid anchor when Engine sends it. */
  edge_note?: string;
}

/** Subset of Engine `valuation_explain` we surface in player detail (additive fields ignored at display). */
export interface ValuationExplain {
  effective_positions?: string[];
  replacement_key_used?: string;
  replacement_value_used?: number;
  surplus_basis?: string;
  inflation_factor?: number;
  pool_to_slot_ratio?: number;
  scoring_category_warnings?: string[];
  /** Baseline / risk explain (mirrors `baseline_components` when `explain_valuation_rows`). */
  age_years?: number;
  age_multiplier?: number;
  depth_chart_position_resolved?: string;
  depth_multiplier?: number;
  age_depth_combined_multiplier?: number;
  injury_severity?: string | number;
  injury_multiplier?: number;
  age_component?: number;
  depth_component?: number;
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
    /** v2: % change in auction-open-relative index (when Engine sends it). */
    inflation_percent_vs_auction_open?: number;
    /** v2: current inflation_factor ÷ factor recomputed at auction open (UI hero gauge). */
    inflation_index_vs_opening_auction?: number;
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
  /** When Engine labels the inflation contract (e.g. replacement_slots_v2). */
  inflation_model?: "replacement_slots_v2";
  /**
   * v2: auction-open-relative index (current allocator ÷ allocator at auction open).
   * Prefer this for hero “Inflation Index” when `inflation_model` is v2.
   */
  inflation_index_vs_opening_auction?: number;
  total_budget_remaining: number;
  pool_value_remaining: number;
  players_remaining: number;
  /** Echo of roster context used for team_adjusted_value / edge (when Engine returns it). */
  user_team_id_used?: string;
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
  /** Response-level Engine valuation context (opaque JSON; diagnostics / detail UI). */
  valuation_context?: Record<string, unknown>;
  /** Engine warnings when valuations may be unstable or context-dependent. */
  valuation_context_warnings?: string[];
}

export async function getValuation(
  leagueId: string,
  token: string,
  userTeamId = "team_1",
  /** When set (e.g. selected Draftroom player), DEV logs raw vs normalized row for that id. */
  devLogFocusPlayerId?: string | null,
  /**
   * When set, reuses the board valuation HTTP response for identical league draft/config state
   * (see {@link ValuationBoardCacheContext}).
   */
  cacheContext?: ValuationBoardCacheContext | null,
): Promise<ValuationResponse> {
  if (cacheContext) {
    return fetchBoardValuationWithCache({
      leagueId,
      token,
      userTeamId,
      devLogFocusPlayerId,
      cacheContext,
    });
  }
  return executeBoardValuationRequest(
    leagueId,
    token,
    userTeamId,
    devLogFocusPlayerId,
  );
}

/** Same envelope as full valuation plus focused `player` row from Engine. */
export type ValuationPlayerResponse = ValuationResponse & {
  player?: ValuationResult;
};

export type GetValuationPlayerOptions = {
  /**
   * When true, asks Engine for row-level explain payloads (`valuation_explain`, notes).
   * Omit or false for minimal payloads (board refresh paths should stay false).
   */
  explainValuationRows?: boolean;
  /**
   * When set with the same inputs used for board cache, dedupes explain calls and memoizes briefly.
   */
  cacheContext?: ValuationBoardCacheContext;
};

export async function getValuationPlayer(
  leagueId: string,
  token: string,
  playerId: string,
  userTeamId = "team_1",
  options?: GetValuationPlayerOptions,
): Promise<ValuationPlayerResponse> {
  const { cacheContext, ...playerOptions } = options ?? {};
  if (cacheContext) {
    return fetchPlayerValuationWithCache({
      leagueId,
      token,
      playerId,
      userTeamId,
      options: playerOptions,
      cacheContext,
    });
  }
  return executePlayerValuationRequest(
    leagueId,
    token,
    playerId,
    userTeamId,
    playerOptions,
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
  catalog_tier?: number;
  catalog_rank?: number;
  auction_tier?: number;
  auction_rank?: number;
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

function newsSignalsFetchSignal(): AbortSignal | undefined {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(22_000);
  }
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 22_000);
  return ac.signal;
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
      signal: newsSignalsFetchSignal(),
    },
    "News signals request failed",
  );
}
