import { Router, Response, RequestHandler } from "express";
import { AxiosError } from "axios";
import { amethyst } from "../lib/amethyst";
import authMiddleware, { AuthRequest } from "../middleware/auth";
import League from "../models/League";
import type { ILeague } from "../models/League";
import RosterEntry from "../models/RosterEntry";
import {
  buildValuationContext,
  buildScarcityContext,
  buildSimulationContext,
  finalizeEngineValuationPostPayload,
  logEngineValuationPayloadIfEnabled,
  logEngineValuationResponseIfEnabled,
  summarizeEngineValuationPayload,
  userIdToTeamId,
  valuationIncomingToEngineContext,
} from "../lib/engineContext";
import {
  CHECKPOINT_CATALOG_ENTRIES,
  readCheckpointFixtureJson,
  isEngineCheckpointId,
} from "../lib/engineCheckpointCatalog";
import { resolveAuctionCurveModelForDraftRequest } from "../lib/auctionCurveModel";
import {
  valuationDiagnosticsEnabled,
  safeJsonByteLength,
  jsonSnippet,
  classifyAxiosLikeError,
} from "../lib/engineValuationDiagnostics";
import { getRequestIdFromStore } from "../lib/requestContext";
import { validateBody, validateQuery } from "../validation/validate";
import {
  mockPickSchema,
  newsSignalsQuerySchema,
  valuationBoardBodySchema,
  valuationCheckpointBodySchema,
  valuationPlayerBodySchema,
  catalogBatchValuesBodySchema,
} from "../validation/schemas";
import { valuationIncomingSchema } from "../validation/schemas";
import { logRequestError } from "../lib/errorLogging";
import { forwardEngineCorrelationHeaders } from "../lib/engineResponseMeta";
import {
  AppError,
  UpstreamError,
  NotFoundError,
  ValidationError,
} from "../lib/appError";
import {
  parseDraftValuationDebugQuery,
  shapeValuationResponseForDraft,
} from "../lib/draftValuationContract";

const router: Router = Router();

// All Engine routes require an authenticated Draftroom user.
router.use(authMiddleware as RequestHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function routeParamString(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return "";
}

function throwEngineError(err: unknown, req: AuthRequest): never {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 502;
    const body = err.response?.data ?? { error: "Engine unreachable" };
    throw new UpstreamError("Engine request failed", status, "ENGINE_UPSTREAM_ERROR", body);
  }

  // Log the original unexpected error with request context, then throw
  // the same typed upstream error response used before centralization.
  logRequestError(err, req, "engine");
  throw new UpstreamError("Engine unreachable", 502, "ENGINE_UNREACHABLE");
}

function resolveUserTeamId(req: AuthRequest, league: ILeague): string {
  const requested = (req.body as { user_team_id?: string } | undefined)?.user_team_id;
  if (requested && typeof requested === "string") {
    return requested;
  }
  try {
    return userIdToTeamId(String(req.user?._id), league.memberIds);
  } catch {
    return "team_1";
  }
}

function valuationPayloadCounts(payload: Record<string, unknown>) {
  const po = payload.position_overrides;
  const io = payload.injury_overrides;
  const pi = payload.player_ids;
  const dp = payload.drafted_players;
  return {
    position_overrides_count: Array.isArray(po) ? po.length : 0,
    injury_overrides_count: Array.isArray(io) ? io.length : 0,
    player_ids_count: Array.isArray(pi) ? pi.length : 0,
    drafted_players_count: Array.isArray(dp) ? dp.length : 0,
  };
}

// ─── POST /api/engine/leagues/:leagueId/valuation ─────────────────────────────
// Returns engine-computed player valuations given the current draft state.

const calculateValuation: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const diag = valuationDiagnosticsEnabled();
  const t0 = Date.now();
  const leagueId = req.params.leagueId;
  let msLeague = 0;
  let msRoster = 0;
  let msContext = 0;
  let msEngine = 0;
  let userTeamIdForLog: string | undefined;

  try {
    const tLeague = Date.now();
    const league = await League.findById(leagueId);
    msLeague = Date.now() - tLeague;
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }

    const tRoster = Date.now();
    const entries = await RosterEntry.find({ leagueId: league._id });
    msRoster = Date.now() - tRoster;

    const body = req.body as {
      explain_valuation_rows?: boolean;
      recommended_bid_soft_cap_ratio?: number;
      auction_curve_model?: "linear_v1" | "tiered_surplus_v1";
    };

    const userTeamId = resolveUserTeamId(req, league);
    userTeamIdForLog = userTeamId;

    const tContext = Date.now();
    const context = await buildValuationContext(league, entries, {
      userTeamId,
      auctionCurveModel: body.auction_curve_model,
    });
    msContext = Date.now() - tContext;

    const payload = finalizeEngineValuationPostPayload({
      ...context,
      ...(body.explain_valuation_rows === true
        ? { explain_valuation_rows: true }
        : {}),
      ...(typeof body.recommended_bid_soft_cap_ratio === "number"
        ? { recommended_bid_soft_cap_ratio: body.recommended_bid_soft_cap_ratio }
        : {}),
    });
    logEngineValuationPayloadIfEnabled(payload);
    const payloadRecord = payload as Record<string, unknown>;
    const payloadBytes = safeJsonByteLength(payloadRecord);

    const tEngine = Date.now();
    let axiosRes;
    try {
      axiosRes = await amethyst.post("/valuation/calculate", payload);
    } catch (engineErr) {
      msEngine = Date.now() - tEngine;
      if (diag) {
        const transport = classifyAxiosLikeError(engineErr);
        const ax = engineErr instanceof AxiosError ? engineErr : null;
        console.info(
          "[valuation-diag] board_engine_error",
          JSON.stringify({
            route: "POST /api/engine/leagues/:leagueId/valuation",
            engine_path: "/valuation/calculate",
            leagueId,
            user_team_id: userTeamIdForLog,
            requestId: getRequestIdFromStore(),
            ms: {
              league: msLeague,
              roster: msRoster,
              context: msContext,
              engine: msEngine,
              total: Date.now() - t0,
            },
            payload_bytes: payloadBytes,
            ...valuationPayloadCounts(payloadRecord),
            ...transport,
            engine_body_snippet:
              ax?.response?.data !== undefined ? jsonSnippet(ax.response.data) : undefined,
          }),
        );
      }
      throw engineErr;
    }
    msEngine = Date.now() - tEngine;

    logEngineValuationResponseIfEnabled(axiosRes.data);
    forwardEngineCorrelationHeaders(res, axiosRes);

    const debugBoard = parseDraftValuationDebugQuery(req.query);
    const shapedBoard = shapeValuationResponseForDraft(axiosRes.data, {
      debug: debugBoard,
    });

    if (diag) {
      const responseBytes = safeJsonByteLength(shapedBoard);
      const summary = summarizeEngineValuationPayload(payloadRecord);
      console.info(
        "[valuation-diag] board_ok",
        JSON.stringify({
          route: "POST /api/engine/leagues/:leagueId/valuation",
          engine_path: "/valuation/calculate",
          leagueId,
          user_team_id: userTeamIdForLog,
          requestId: getRequestIdFromStore(),
          ms: {
            league: msLeague,
            roster: msRoster,
            context: msContext,
            engine: msEngine,
            total: Date.now() - t0,
          },
          payload_bytes: payloadBytes,
          response_bytes: responseBytes,
          position_overrides_count: summary.position_overrides_count,
          injury_overrides_count: summary.injury_overrides_count,
          player_ids_count: valuationPayloadCounts(payloadRecord).player_ids_count,
          drafted_players_count: summary.drafted_players_length,
        }),
      );
    }

    res.json(shapedBoard);
  } catch (err) {
    if (diag) {
      if (err instanceof AppError) {
        console.info(
          "[valuation-diag] board_app_error",
          JSON.stringify({
            route: "POST /api/engine/leagues/:leagueId/valuation",
            leagueId,
            user_team_id: userTeamIdForLog,
            requestId: getRequestIdFromStore(),
            ms: {
              league: msLeague,
              roster: msRoster,
              context: msContext,
              engine: msEngine,
              total: Date.now() - t0,
            },
            code: err.code,
            statusCode: err.statusCode,
            message: err.message,
            details_snippet:
              err.details !== undefined ? jsonSnippet(err.details, 600) : undefined,
          }),
        );
      } else if (!(err instanceof AxiosError)) {
        console.info(
          "[valuation-diag] board_unexpected",
          JSON.stringify({
            route: "POST /api/engine/leagues/:leagueId/valuation",
            leagueId,
            user_team_id: userTeamIdForLog,
            requestId: getRequestIdFromStore(),
            ms: {
              league: msLeague,
              roster: msRoster,
              context: msContext,
              engine: msEngine,
              total: Date.now() - t0,
            },
            ...classifyAxiosLikeError(err),
          }),
        );
      }
    }
    if (err instanceof AppError) throw err;
    throwEngineError(err, req);
  }
};

// ─── POST /api/engine/leagues/:leagueId/valuation/player ──────────────────────
// Same valuation context as /valuation plus player_id; Engine returns one row under `player`.

const calculateValuationPlayer: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const diag = valuationDiagnosticsEnabled();
  const t0 = Date.now();
  const leagueId = req.params.leagueId;
  let msLeague = 0;
  let msRoster = 0;
  let msContext = 0;
  let msEngine = 0;
  let userTeamIdForLog: string | undefined;

  try {
    const tLeague = Date.now();
    const league = await League.findById(leagueId);
    msLeague = Date.now() - tLeague;
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }

    const tRoster = Date.now();
    const entries = await RosterEntry.find({ leagueId: league._id });
    msRoster = Date.now() - tRoster;

    const body = req.body as {
      player_id: string;
      explain_valuation_rows?: boolean;
      recommended_bid_soft_cap_ratio?: number;
      auction_curve_model?: "linear_v1" | "tiered_surplus_v1";
    };

    const userTeamId = resolveUserTeamId(req, league);
    userTeamIdForLog = userTeamId;

    const tContext = Date.now();
    const context = await buildValuationContext(league, entries, {
      userTeamId,
      auctionCurveModel: body.auction_curve_model,
    });
    msContext = Date.now() - tContext;

    const base = finalizeEngineValuationPostPayload({
      ...context,
      ...(body.explain_valuation_rows === true
        ? { explain_valuation_rows: true }
        : {}),
      ...(typeof body.recommended_bid_soft_cap_ratio === "number"
        ? { recommended_bid_soft_cap_ratio: body.recommended_bid_soft_cap_ratio }
        : {}),
    });
    logEngineValuationPayloadIfEnabled(base);
    const { player_id } = body;
    const payload = { ...base, player_id };
    const payloadRecord = payload as Record<string, unknown>;
    const payloadBytes = safeJsonByteLength(payloadRecord);

    const tEngine = Date.now();
    let axiosRes;
    try {
      axiosRes = await amethyst.post("/valuation/player", payload);
    } catch (engineErr) {
      msEngine = Date.now() - tEngine;
      if (diag) {
        const transport = classifyAxiosLikeError(engineErr);
        const ax = engineErr instanceof AxiosError ? engineErr : null;
        console.info(
          "[valuation-diag] player_engine_error",
          JSON.stringify({
            route: "POST /api/engine/leagues/:leagueId/valuation/player",
            engine_path: "/valuation/player",
            leagueId,
            user_team_id: userTeamIdForLog,
            player_id,
            requestId: getRequestIdFromStore(),
            ms: {
              league: msLeague,
              roster: msRoster,
              context: msContext,
              engine: msEngine,
              total: Date.now() - t0,
            },
            payload_bytes: payloadBytes,
            ...valuationPayloadCounts(payloadRecord),
            ...transport,
            engine_body_snippet:
              ax?.response?.data !== undefined ? jsonSnippet(ax.response.data) : undefined,
          }),
        );
      }
      throw engineErr;
    }
    msEngine = Date.now() - tEngine;

    logEngineValuationResponseIfEnabled(axiosRes.data);
    forwardEngineCorrelationHeaders(res, axiosRes);

    const debugPlayer = parseDraftValuationDebugQuery(req.query);
    const shapedPlayer = shapeValuationResponseForDraft(axiosRes.data, {
      debug: debugPlayer,
    });

    if (diag) {
      const responseBytes = safeJsonByteLength(shapedPlayer);
      const summary = summarizeEngineValuationPayload(base as Record<string, unknown>);
      console.info(
        "[valuation-diag] player_ok",
        JSON.stringify({
          route: "POST /api/engine/leagues/:leagueId/valuation/player",
          engine_path: "/valuation/player",
          leagueId,
          user_team_id: userTeamIdForLog,
          player_id,
          requestId: getRequestIdFromStore(),
          ms: {
            league: msLeague,
            roster: msRoster,
            context: msContext,
            engine: msEngine,
            total: Date.now() - t0,
          },
          payload_bytes: payloadBytes,
          response_bytes: responseBytes,
          position_overrides_count: summary.position_overrides_count,
          injury_overrides_count: summary.injury_overrides_count,
          player_ids_count: valuationPayloadCounts(payloadRecord).player_ids_count,
          drafted_players_count: summary.drafted_players_length,
        }),
      );
    }

    res.json(shapedPlayer);
  } catch (err) {
    if (diag) {
      if (err instanceof AppError) {
        console.info(
          "[valuation-diag] player_app_error",
          JSON.stringify({
            route: "POST /api/engine/leagues/:leagueId/valuation/player",
            leagueId,
            user_team_id: userTeamIdForLog,
            requestId: getRequestIdFromStore(),
            ms: {
              league: msLeague,
              roster: msRoster,
              context: msContext,
              engine: msEngine,
              total: Date.now() - t0,
            },
            code: err.code,
            statusCode: err.statusCode,
            message: err.message,
            details_snippet:
              err.details !== undefined ? jsonSnippet(err.details, 600) : undefined,
          }),
        );
      } else if (!(err instanceof AxiosError)) {
        console.info(
          "[valuation-diag] player_unexpected",
          JSON.stringify({
            route: "POST /api/engine/leagues/:leagueId/valuation/player",
            leagueId,
            user_team_id: userTeamIdForLog,
            requestId: getRequestIdFromStore(),
            ms: {
              league: msLeague,
              roster: msRoster,
              context: msContext,
              engine: msEngine,
              total: Date.now() - t0,
            },
            ...classifyAxiosLikeError(err),
          }),
        );
      }
    }
    if (err instanceof AppError) throw err;
    throwEngineError(err, req);
  }
};

// ─── POST /api/engine/leagues/:leagueId/scarcity ──────────────────────────────
// Returns positional scarcity analysis given the current draft state.
// Optional query param: position (e.g. ?position=SS)

const analyzeScarcity: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const league = await League.findById(req.params.leagueId);
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const position =
      typeof req.query.position === "string" ? req.query.position : undefined;
    const context = buildScarcityContext(league, entries, position);
    const axiosRes = await amethyst.post("/analysis/scarcity", context);
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throwEngineError(err, req);
  }
};

// ─── POST /api/engine/leagues/:leagueId/mock-pick ─────────────────────────────
// Simulates the next auction nomination given current team budgets.
// Body: { budgetByTeamId: Record<string, number>, availablePlayerIds?: string[] }

const simulateMockPick: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const league = await League.findById(req.params.leagueId);
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const { budgetByTeamId, availablePlayerIds } = req.body as {
      budgetByTeamId: Record<string, number>;
      availablePlayerIds?: string[];
    };
    const context = buildSimulationContext(
      league,
      entries,
      budgetByTeamId,
      availablePlayerIds,
    );
    const axiosRes = await amethyst.post("/simulation/mock-pick", context);
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throwEngineError(err, req);
  }
};

// ─── GET /api/engine/signals/news ─────────────────────────────────────────────
// No league context needed — returns recent injury/news signals.
// Query params: days?, signal_type?

const getNewsSignals: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { days, signal_type } = req.query as {
      days?: number;
      signal_type?: string;
    };
    const params: Record<string, string> = {};
    if (days) params.days = String(days);
    if (signal_type) params.signal_type = signal_type;

    const axiosRes = await amethyst.get("/signals/news", { params });
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throwEngineError(err, req);
  }
};

// ─── POST /api/engine/catalog/batch-values ────────────────────────────────────
// Baseline value / tier / adp for a set of player ids (no league roster context).

const postCatalogBatchValues: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const axiosRes = await amethyst.post("/catalog/batch-values", req.body);
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throwEngineError(err, req);
  }
};

// ─── GET /api/engine/checkpoints ────────────────────────────────────────────────
// Bundled valuation-request fixtures (nested Activity #9 shape); filenames map to Engine portal names — see ENGINE_AGENT_BRIEF.md.

const listEngineCheckpoints: RequestHandler = (_req, res): void => {
  res.json({ checkpoints: CHECKPOINT_CATALOG_ENTRIES });
};

const getCheckpointFixtureJsonHandler: RequestHandler = (
  req: AuthRequest,
  res: Response,
): void => {
  const key = routeParamString(req.params.checkpointKey);
  if (!isEngineCheckpointId(key)) {
    throw new ValidationError("Unknown checkpoint key", 400, "CHECKPOINT_UNKNOWN");
  }
  res.json(readCheckpointFixtureJson(key));
};

/** POST body uses the same bundled JSON as graders; Engine receives the flattened POST /valuation/calculate body from {@link valuationIncomingToEngineContext}. */
const calculateValuationFromCheckpoint: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const leagueId = req.params.leagueId;
  const body = req.body as {
    checkpoint_key: (typeof CHECKPOINT_CATALOG_ENTRIES)[number]["id"];
    user_team_id?: string;
    inflation_model?: "replacement_slots_v2";
    auction_curve_model?: "linear_v1" | "tiered_surplus_v1";
    explain_valuation_rows?: boolean;
    recommended_bid_soft_cap_ratio?: number;
  };

  const league = await League.findById(leagueId);
  if (!league) {
    throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
  }

  let parsedIncoming;
  try {
    const raw = readCheckpointFixtureJson(body.checkpoint_key);
    parsedIncoming = valuationIncomingSchema.parse(raw);
  } catch (err) {
    throw new ValidationError(
      "Checkpoint fixture failed validation — refresh Draft fixtures or schema",
      400,
      "CHECKPOINT_FIXTURE_INVALID",
      err instanceof Error ? { message: err.message } : undefined,
    );
  }

  const context = valuationIncomingToEngineContext(parsedIncoming);
  const userTeamId = resolveUserTeamId(req, league);

  const payload = finalizeEngineValuationPostPayload({
    ...context,
    user_team_id: userTeamId,
    ...(body.inflation_model ? { inflation_model: body.inflation_model } : {}),
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({
      auction_curve_model: body.auction_curve_model,
    }),
    ...(body.explain_valuation_rows === true
      ? { explain_valuation_rows: true }
      : {}),
    ...(typeof body.recommended_bid_soft_cap_ratio === "number"
      ? { recommended_bid_soft_cap_ratio: body.recommended_bid_soft_cap_ratio }
      : {}),
  });

  logEngineValuationPayloadIfEnabled(payload);
  try {
    const axiosRes = await amethyst.post("/valuation/calculate", payload);
    logEngineValuationResponseIfEnabled(axiosRes.data);
    forwardEngineCorrelationHeaders(res, axiosRes);
    const debugCp = parseDraftValuationDebugQuery(req.query);
    const shapedCp = shapeValuationResponseForDraft(axiosRes.data, { debug: debugCp });
    res.json(shapedCp);
  } catch (engineErr) {
    throwEngineError(engineErr, req);
  }
};

// ─── Route registration ───────────────────────────────────────────────────────

router.get("/checkpoints", listEngineCheckpoints);
router.get("/checkpoints/:checkpointKey/json", getCheckpointFixtureJsonHandler);
router.post(
  "/leagues/:leagueId/valuation/checkpoint",
  validateBody(valuationCheckpointBodySchema),
  calculateValuationFromCheckpoint,
);
router.post(
  "/leagues/:leagueId/valuation",
  validateBody(valuationBoardBodySchema),
  calculateValuation,
);
router.post(
  "/leagues/:leagueId/valuation/player",
  validateBody(valuationPlayerBodySchema),
  calculateValuationPlayer,
);
router.post("/leagues/:leagueId/scarcity", analyzeScarcity);
router.post("/leagues/:leagueId/mock-pick", validateBody(mockPickSchema), simulateMockPick);
router.post(
  "/catalog/batch-values",
  validateBody(catalogBatchValuesBodySchema),
  postCatalogBatchValues,
);
router.get("/signals/news", validateQuery(newsSignalsQuerySchema), getNewsSignals);

export default router;
