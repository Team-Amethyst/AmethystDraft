import { Router, Response, RequestHandler } from "express";
import { AxiosError } from "axios";
import { amethyst } from "../lib/amethyst";
import authMiddleware, { AuthRequest } from "../middleware/auth";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import {
  buildValuationContext,
  buildScarcityContext,
  buildSimulationContext,
} from "../lib/engineContext";
import { sendError } from "../lib/apiResponse";
import { validateBody, validateQuery } from "../validation/validate";
import { mockPickSchema, newsSignalsQuerySchema } from "../validation/schemas";

const router: Router = Router();

// All Engine routes require an authenticated Draftroom user.
router.use(authMiddleware as RequestHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleEngineError(err: unknown, res: Response): void {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 502;
    const body = err.response?.data ?? { error: "Engine unreachable" };
    sendError(res, status, {
      code: "ENGINE_UPSTREAM_ERROR",
      message: "Engine request failed",
      details: body,
    });
    return;
  }
  console.error("Unexpected Engine error:", err);
  sendError(res, 502, {
    code: "ENGINE_UNREACHABLE",
    message: "Engine unreachable",
  });
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
      sendError(res, 404, {
        code: "LEAGUE_NOT_FOUND",
        message: "League not found",
      });
      return;
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const context = buildValuationContext(league, entries);
    const { data } = await amethyst.post("/valuation/calculate", context);
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
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
      sendError(res, 404, {
        code: "LEAGUE_NOT_FOUND",
        message: "League not found",
      });
      return;
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const position =
      typeof req.query.position === "string" ? req.query.position : undefined;
    const context = buildScarcityContext(league, entries, position);
    const { data } = await amethyst.post("/analysis/scarcity", context);
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
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
      sendError(res, 404, {
        code: "LEAGUE_NOT_FOUND",
        message: "League not found",
      });
      return;
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
    const { data } = await amethyst.post("/simulation/mock-pick", context);
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
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

    const { data } = await amethyst.get("/signals/news", { params });
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
  }
};

// ─── Route registration ───────────────────────────────────────────────────────

router.post("/leagues/:leagueId/valuation", calculateValuation);
router.post("/leagues/:leagueId/scarcity", analyzeScarcity);
router.post("/leagues/:leagueId/mock-pick", validateBody(mockPickSchema), simulateMockPick);
router.get("/signals/news", validateQuery(newsSignalsQuerySchema), getNewsSignals);

export default router;
