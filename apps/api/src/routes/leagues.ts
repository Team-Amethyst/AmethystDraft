import { Router, RequestHandler, Response } from "express";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
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
      teamNames,
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
      teamNames: teamNames ?? [],
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
      teamNames,
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
    if (teamNames !== undefined) league.teamNames = teamNames;

    await league.save();
    res.json(serializeLeague(league));
  } catch (err) {
    console.error("Update league error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/leagues/:id/roster ──────────────────────────────────────────────

const getRoster: RequestHandler = async (
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
    const entries = await RosterEntry.find({ leagueId: req.params.id }).sort({
      rosterSlot: 1,
    });
    res.json(entries);
  } catch (err) {
    console.error("Get roster error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/leagues/:id/roster ─────────────────────────────────────────────

const addRosterEntry: RequestHandler = async (
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
    const {
      externalPlayerId,
      playerName,
      playerTeam,
      positions,
      price,
      rosterSlot,
      userId,
      isKeeper,
    } = req.body;
    const memberIds = league.memberIds.map(String);
    const requesterId = String(req.user!._id);
    const isCommissioner = String(league.commissionerId) === requesterId;
    if (userId && userId !== requesterId && !isCommissioner) {
      res
        .status(403)
        .json({
          message: "Only the commissioner can add entries for other teams",
        });
      return;
    }
    const resolvedUserId =
      userId && isCommissioner ? String(userId) : requesterId;
    const teamIndex = memberIds.indexOf(resolvedUserId);
    const teamId = teamIndex >= 0 ? `team_${teamIndex + 1}` : `team_1`;
    const entry = await RosterEntry.create({
      leagueId: String(req.params.id),
      userId: resolvedUserId,
      teamId,
      externalPlayerId,
      playerName,
      playerTeam: playerTeam ?? "",
      positions: positions ?? [],
      price,
      rosterSlot,
      isKeeper: isKeeper ?? false,
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error("Add roster entry error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/leagues/:id/roster/:entryId ──────────────────────────────────

const removeRosterEntry: RequestHandler = async (
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
    await RosterEntry.findOneAndDelete({
      _id: req.params.entryId,
      leagueId: req.params.id,
    });
    res.status(204).send();
  } catch (err) {
    console.error("Remove roster entry error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Route registration ────────────────────────────────────────────────────────

router.post("/", createLeague);
router.get("/", getMyLeagues);
router.get("/:id", getLeague);
router.patch("/:id", updateLeague);
router.get("/:id/roster", getRoster);
router.post("/:id/roster", addRosterEntry);
router.delete("/:id/roster/:entryId", removeRosterEntry);

export default router;
