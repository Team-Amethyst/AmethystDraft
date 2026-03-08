const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── /api/engine/leagues/:leagueId/valuation ──────────────────────────────────

export interface ValuationResult {
  player_id: string;
  name: string;
  position: string;
  tier: number;
  baseline_value: number;
  adjusted_value: number;
  indicator: "Steal" | "Reach" | "Fair Value";
}

export interface ValuationResponse {
  inflation_factor: number;
  total_budget_remaining: number;
  pool_value_remaining: number;
  players_remaining: number;
  valuations: ValuationResult[];
  calculated_at: string;
}

export async function getValuation(
  leagueId: string,
  token: string,
): Promise<ValuationResponse> {
  const res = await fetch(
    `${API_BASE}/api/engine/leagues/${leagueId}/valuation`,
    { method: "POST", headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error("Valuation request failed");
  return res.json() as Promise<ValuationResponse>;
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
  const res = await fetch(
    `${API_BASE}/api/engine/leagues/${leagueId}/scarcity${qs}`,
    { method: "POST", headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error("Scarcity request failed");
  return res.json() as Promise<ScarcityResponse>;
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
  const res = await fetch(
    `${API_BASE}/api/engine/leagues/${leagueId}/mock-pick`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ budgetByTeamId, availablePlayerIds }),
    },
  );
  if (!res.ok) throw new Error("Mock-pick request failed");
  return res.json() as Promise<MockPickResponse>;
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
  const res = await fetch(`${API_BASE}/api/engine/signals/news${qs}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("News signals request failed");
  return res.json() as Promise<NewsSignalsResponse>;
}
