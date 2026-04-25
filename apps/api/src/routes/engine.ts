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
  userIdToTeamId,
} from "../lib/engineContext";
import { validateBody, validateQuery } from "../validation/validate";
import {
  mockPickSchema,
  newsSignalsQuerySchema,
  valuationPlayerBodySchema,
  catalogBatchValuesBodySchema,
} from "../validation/schemas";
import { logRequestError } from "../lib/errorLogging";
import { forwardEngineCorrelationHeaders } from "../lib/engineResponseMeta";
import { 
  AppError, 
  UpstreamError, 
  NotFoundError 
} from "../lib/appError";

const router: Router = Router();

// All Engine routes require an authenticated Draftroom user.
router.use(authMiddleware as RequestHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── POST /api/engine/leagues/:leagueId/valuation ─────────────────────────────
// Returns engine-computed player valuations given the current draft state.

const calculateValuation: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const league = await League.findById(req.params.leagueId);
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const context = buildValuationContext(league, entries, {
      userTeamId: resolveUserTeamId(req, league),
    });
    const payload = finalizeEngineValuationPostPayload(context);
    const axiosRes = await amethyst.post("/valuation/calculate", payload);
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
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
  try {
    const league = await League.findById(req.params.leagueId);
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const context = buildValuationContext(league, entries, {
      userTeamId: resolveUserTeamId(req, league),
    });
    const base = finalizeEngineValuationPostPayload(context);
    const { player_id } = req.body as { player_id: string };
    const payload = { ...base, player_id };
    const axiosRes = await amethyst.post("/valuation/player", payload);
    forwardEngineCorrelationHeaders(res, axiosRes);
    res.json(axiosRes.data);
  } catch (err) {
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

// ─── Route registration ───────────────────────────────────────────────────────

router.post("/leagues/:leagueId/valuation", calculateValuation);
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
