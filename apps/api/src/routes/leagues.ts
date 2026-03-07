import { Router, RequestHandler, Response } from "express";
import League from "../models/League";
import authMiddleware, { AuthRequest } from "../middleware/auth";

const router: Router = Router();

router.use(authMiddleware as RequestHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeLeague(league: InstanceType<typeof League>) {
  const obj = league.toObject();
  return {
    ...obj,
    id: String(obj._id),
    commissionerId: String(obj.commissionerId),
    memberIds: (obj.memberIds ?? []).map(String),
    _id: undefined,
    __v: undefined,
  };
}

// ─── POST /api/leagues ─────────────────────────────────────────────────────────

const createLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const {
      name,
      teams,
      budget,
      hitterBudgetPct,
      rosterSlots,
      scoringFormat,
      scoringCategories,
      playerPool,
      draftDate,
    } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ message: "League name is required" });
      return;
    }

    const league = await League.create({
      name: name.trim(),
      commissionerId: req.user!._id,
      memberIds: [req.user!._id],
      teams: teams ?? 12,
      budget: budget ?? 260,
      hitterBudgetPct: hitterBudgetPct ?? 70,
      rosterSlots: rosterSlots ?? undefined,
      scoringFormat: scoringFormat ?? "5x5",
      scoringCategories: scoringCategories ?? [],
      playerPool: playerPool ?? "Mixed",
      draftDate: draftDate ? new Date(draftDate) : undefined,
    });

    res.status(201).json(serializeLeague(league));
  } catch (err) {
    console.error("Create league error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/leagues ──────────────────────────────────────────────────────────

const getMyLeagues: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const leagues = await League.find({ memberIds: req.user!._id });
    res.json(leagues.map(serializeLeague));
  } catch (err) {
    console.error("Get leagues error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/leagues/:id ──────────────────────────────────────────────────────

const getLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });

    if (!league) {
      res.status(404).json({ message: "League not found" });
      return;
    }

    res.json(serializeLeague(league));
  } catch (err) {
    console.error("Get league error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/leagues/:id ───────────────────────────────────────────────────

const updateLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      commissionerId: req.user!._id,
    });

    if (!league) {
      res.status(404).json({ message: "League not found or not authorized" });
      return;
    }

    const {
      name,
      teams,
      budget,
      hitterBudgetPct,
      rosterSlots,
      scoringFormat,
      scoringCategories,
      playerPool,
      draftDate,
    } = req.body;

    if (name !== undefined) league.name = String(name).trim();
    if (teams !== undefined) league.teams = teams;
    if (budget !== undefined) league.budget = budget;
    if (hitterBudgetPct !== undefined) league.hitterBudgetPct = hitterBudgetPct;
    if (rosterSlots !== undefined) league.rosterSlots = rosterSlots;
    if (scoringFormat !== undefined) league.scoringFormat = scoringFormat;
    if (scoringCategories !== undefined)
      league.scoringCategories = scoringCategories;
    if (playerPool !== undefined) league.playerPool = playerPool;
    if (draftDate !== undefined)
      league.draftDate = draftDate ? new Date(draftDate) : undefined;

    await league.save();
    res.json(serializeLeague(league));
  } catch (err) {
    console.error("Update league error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Route registration ────────────────────────────────────────────────────────

router.post("/", createLeague);
router.get("/", getMyLeagues);
router.get("/:id", getLeague);
router.patch("/:id", updateLeague);

export default router;
