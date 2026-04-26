import { authHeaders, requestJson } from "./client";

export interface CatalogBatchValuesRequest {
  player_ids: string[];
  league_scope?: "Mixed" | "AL" | "NL";
  pos_eligibility_threshold?: number;
}

export interface CatalogBatchPlayerRow {
  player_id: string;
  value: number;
  tier: number;
}

export interface CatalogBatchValuesResponse {
  players: CatalogBatchPlayerRow[];
}

export async function getCatalogBatchValues(
  token: string,
  payload: CatalogBatchValuesRequest,
): Promise<CatalogBatchValuesResponse> {
  return requestJson<CatalogBatchValuesResponse>(
    "/api/engine/catalog/batch-values",
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    },
    "Failed to fetch Engine catalog values",
  );
}

export interface ScarcityPosition {
  position: string;
  elite_remaining: number;
  mid_tier_remaining: number;
  total_remaining: number;
  scarcity_score: number;
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
    {
      method: "POST",
      headers: authHeaders(token),
    },
    "Scarcity request failed",
  );
}

export interface NewsSignal {
  player_id?: string;
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

  if (options?.days) {
    params.set("days", String(options.days));
  }

  if (options?.signal_type) {
    params.set("signal_type", options.signal_type);
  }

  const qs = params.size > 0 ? `?${params.toString()}` : "";

  return requestJson<NewsSignalsResponse>(
    `/api/engine/signals/news${qs}`,
    {
      headers: authHeaders(token),
    },
    "News signals request failed",
  );
}