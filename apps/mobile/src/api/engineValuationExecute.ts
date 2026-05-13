import { authHeaders, requestJson } from "./client";
import type { ValuationPlayerResponse, ValuationResponse } from "./engine";

export async function executeBoardValuationRequest(
  leagueId: string,
  token: string,
  userTeamId = "team_1",
): Promise<ValuationResponse> {
  return requestJson<ValuationResponse>(
    `/api/engine/leagues/${leagueId}/valuation`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        user_team_id: userTeamId,
        inflation_model: "replacement_slots_v2",
      }),
    },
    "Valuation request failed",
  );
}

export type ExecutePlayerValuationOptions = {
  explainValuationRows?: boolean;
};

export async function executePlayerValuationRequest(
  leagueId: string,
  token: string,
  playerId: string,
  userTeamId = "team_1",
  options?: ExecutePlayerValuationOptions,
): Promise<ValuationPlayerResponse> {
  const pid = String(playerId).trim();
  const explain = options?.explainValuationRows === true;
  return requestJson<ValuationPlayerResponse>(
    `/api/engine/leagues/${leagueId}/valuation/player`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        player_id: pid,
        user_team_id: userTeamId,
        inflation_model: "replacement_slots_v2",
        ...(explain ? { explain_valuation_rows: true } : {}),
      }),
    },
    "Valuation (player) request failed",
  );
}

export type ValuationInternalExecutors = {
  board: typeof executeBoardValuationRequest;
  player: typeof executePlayerValuationRequest;
};

let executors: ValuationInternalExecutors = {
  board: executeBoardValuationRequest,
  player: executePlayerValuationRequest,
};

export function __setValuationExecutorsForTests(
  next: Partial<ValuationInternalExecutors> | null,
): void {
  executors = {
    board: next?.board ?? executeBoardValuationRequest,
    player: next?.player ?? executePlayerValuationRequest,
  };
}

export function __getValuationExecutors(): ValuationInternalExecutors {
  return executors;
}
