/**
 * Uncached HTTP wiring for Engine valuation endpoints — used by {@link ../valuationCache}
 * and public {@link ./engine} exports when cache is bypassed.
 */
import { requireAuthHeaders, requestJsonParsed } from "./client";
import {
  findRawValuationEntry,
  normalizeValuationPlayerResponseBody,
  normalizeValuationResponseBody,
  rawValuationRowPipelineSnapshot,
  valuationRowPipelineSnapshot,
} from "./valuationNormalize";
import type { ValuationPlayerResponse, ValuationResponse } from "./engine";

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
    user_team_id_used: normalized.user_team_id_used ?? null,
    selected_player_id: focus ?? null,
    valuation_context_warnings:
      normalized.valuation_context_warnings ?? null,
    A_board_raw_row: rawValuationRowPipelineSnapshot(rawRow),
    B_getValuation_normalized_row: valuationRowPipelineSnapshot(normRow),
    valuations_len: normalized.valuations.length,
  });
}

export async function executeBoardValuationRequest(
  leagueId: string,
  token: string,
  userTeamId = "team_1",
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
  return requestJsonParsed<ValuationPlayerResponse>(
    `/api/engine/leagues/${leagueId}/valuation/player`,
    {
      method: "POST",
      headers: requireAuthHeaders(token),
      body: JSON.stringify({
        player_id: playerId,
        user_team_id: userTeamId,
        inflation_model: "replacement_slots_v2",
        ...(explain ? { explain_valuation_rows: true } : {}),
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
        user_team_id_used: normalized.user_team_id_used ?? null,
        selected_player_id: pid,
        valuation_context_warnings:
          normalized.valuation_context_warnings ?? null,
        C_player_raw_row: rawValuationRowPipelineSnapshot(rawRow),
        D_getValuationPlayer_normalized_row: valuationRowPipelineSnapshot(normRow),
      });
      return normalized;
    },
  );
}

/** Test seam — assign mock executors without touching HTTP. */
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
