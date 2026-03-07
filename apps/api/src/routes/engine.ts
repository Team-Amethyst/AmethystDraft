import { Router, Response, RequestHandler } from "express";
import { AxiosError } from "axios";
import { amethyst } from "../lib/amethyst";
import authMiddleware, { AuthRequest } from "../middleware/auth";

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

// ─── POST /api/engine/valuation/calculate ─────────────────────────────────────

const calculateValuation: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { data } = await amethyst.post("/valuation/calculate", req.body);
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
  }
};

// ─── POST /api/engine/analysis/scarcity ───────────────────────────────────────

const analyzeScarcity: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { data } = await amethyst.post("/analysis/scarcity", req.body);
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
  }
};

// ─── POST /api/engine/simulation/mock-pick ────────────────────────────────────

const simulateMockPick: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { data } = await amethyst.post("/simulation/mock-pick", req.body);
    res.json(data);
  } catch (err) {
    handleEngineError(err, res);
  }
};

// ─── GET /api/engine/signals/news ─────────────────────────────────────────────

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

router.post("/valuation/calculate", calculateValuation);
router.post("/analysis/scarcity", analyzeScarcity);
router.post("/simulation/mock-pick", simulateMockPick);
router.get("/signals/news", getNewsSignals);

export default router;
