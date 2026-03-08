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

const router: Router = Router();

// All Engine routes require an authenticated Draftroom user.
router.use(authMiddleware as RequestHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleEngineError(err: unknown, res: Response): void {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 502;
    const body = err.response?.data ?? { error: "Engine unreachable" };
    res.status(status).json(body);
    return;
  }
  console.error("Unexpected Engine error:", err);
  res.status(502).json({ error: "Engine unreachable" });
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
      res.status(404).json({ error: "League not found" });
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
      res.status(404).json({ error: "League not found" });
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
      res.status(404).json({ error: "League not found" });
      return;
    }
    const entries = await RosterEntry.find({ leagueId: league._id });
    const { budgetByTeamId = {}, availablePlayerIds } = req.body as {
      budgetByTeamId?: Record<string, number>;
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
    const { days, signal_type } = req.query as Record<
      string,
      string | undefined
    >;
    const params: Record<string, string> = {};
    if (days) params.days = days;
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
router.post("/leagues/:leagueId/mock-pick", simulateMockPick);
router.get("/signals/news", getNewsSignals);

export default router;
