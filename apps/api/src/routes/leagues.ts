import { Router, RequestHandler, Response, NextFunction } from "express";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import PlayerNote from "../models/PlayerNote";
import WatchlistEntry from "../models/WatchlistEntry";
import authMiddleware, { AuthRequest } from "../middleware/auth";
import { validate } from "../validation/validate";
import {
  createLeagueSchema,
  updateLeagueSchema,
  addRosterEntrySchema,
} from "../validation/schemas";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../lib/appError";

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
  next: NextFunction,
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
      posEligibilityThreshold,
    } = req.body;

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
      posEligibilityThreshold: posEligibilityThreshold ?? 20,
    });

    res.status(201).json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues ──────────────────────────────────────────────────────────

const getMyLeagues: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const leagues = await League.find({ memberIds: req.user!._id });
    res.json(leagues.map(serializeLeague));
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:id ──────────────────────────────────────────────────────

const getLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });

    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }

    res.json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/leagues/:id ───────────────────────────────────────────────────

const updateLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      commissionerId: req.user!._id,
    });

    if (!league) {
      throw new NotFoundError("League not found or not authorized", 404, "LEAGUE_NOT_FOUND_OR_UNAUTHORIZED");
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
      posEligibilityThreshold,
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
    if (posEligibilityThreshold !== undefined)
      league.posEligibilityThreshold = posEligibilityThreshold;

    await league.save();
    res.json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:id/roster ──────────────────────────────────────────────

const getRoster: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entries = await RosterEntry.find({ leagueId: req.params.id }).sort({
      rosterSlot: 1,
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/leagues/:id/roster ─────────────────────────────────────────────

const addRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const {
      externalPlayerId,
      playerName,
      playerTeam,
      positions,
      price,
      rosterSlot,
      userId,
      teamId: bodyTeamId,
      isKeeper,
    } = req.body;
    const memberIds = league.memberIds.map(String);
    const requesterId = String(req.user!._id);
    const isCommissioner = String(league.commissionerId) === requesterId;
    if (userId && userId !== requesterId && !isCommissioner) {
      throw new ForbiddenError("Only the commissioner can add entries for other teams", 403, "FORBIDDEN_TEAM_WRITE");
    }
    const resolvedUserId =
      userId && isCommissioner ? String(userId) : requesterId;
    const teamIndex = memberIds.indexOf(resolvedUserId);
    // Commissioner may pass teamId explicitly for unjoined team slots
    const teamId =
      bodyTeamId && isCommissioner
        ? String(bodyTeamId)
        : teamIndex >= 0
          ? `team_${teamIndex + 1}`
          : `team_1`;
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
    next(err);
  }
};

// ─── DELETE /api/leagues/:id/roster/:entryId ──────────────────────────────────

const removeRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entry = await RosterEntry.findOne({
      _id: req.params.entryId,
      leagueId: req.params.id,
    });
    if (!entry) {
      throw new NotFoundError("Entry not found", 404, "ENTRY_NOT_FOUND");
    }
    const isCommissioner =
      String(league.commissionerId) === String(req.user!._id);
    if (!isCommissioner && String(entry.userId) !== String(req.user!._id)) {
      throw new ForbiddenError("Not authorized to remove this entry", 403, "FORBIDDEN_TEAM_WRITE");
    }
    await entry.deleteOne();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/leagues/:id/roster/:entryId ──────────────────────────────────

const updateRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Must be a league member
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const isCommissioner =
      String(league.commissionerId) === String(req.user!._id);

    // Load the entry and verify ownership
    const existingEntry = await RosterEntry.findOne({
      _id: req.params.entryId,
      leagueId: req.params.id,
    }).lean();
    if (!existingEntry) {
      throw new NotFoundError("Entry not found", 404, "ENTRY_NOT_FOUND");
    }
    if (
      !isCommissioner &&
      String(existingEntry.userId) !== String(req.user!._id)
    ) {
      throw new ForbiddenError("Not authorized to update this entry", 403, "FORBIDDEN_TEAM_WRITE");
    }

    const { price, rosterSlot, teamId } = req.body as {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
    };

    // Only the commissioner can reassign an entry to a different team
    if (teamId !== undefined && !isCommissioner) {
      throw new ForbiddenError("Only the commissioner can reassign entries", 403, "FORBIDDEN_TEAM_WRITE");
    }

    const update: Record<string, unknown> = {};
    if (price !== undefined) update.price = price;
    if (rosterSlot !== undefined) update.rosterSlot = rosterSlot;
    if (teamId !== undefined) {
      const teamIndex = parseInt(teamId.replace("team_", ""), 10) - 1;
      if (isNaN(teamIndex) || teamIndex < 0) {
        throw new ValidationError("Invalid teamId", 400, "INVALID_TEAM_ID");
      }
      update.teamId = teamId;
      // Also update userId if that team slot has a joined member
      const newUserId = league.memberIds[teamIndex];
      if (newUserId) update.userId = newUserId;
    }
    const entry = await RosterEntry.findOneAndUpdate(
      { _id: req.params.entryId, leagueId: req.params.id },
      { $set: update },
      { new: true },
    );
    if (!entry) {
      throw new NotFoundError("Entry not found", 404, "ENTRY_NOT_FOUND");
    }
    res.json(entry);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:leagueId/notes ─────────────────────────────────────────

const getNotes: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const notes = await PlayerNote.find({
      leagueId: req.params.id,
      userId: req.user!._id,
    });
    const map: Record<string, string> = {};
    for (const n of notes) {
      map[n.externalPlayerId] = n.content;
    }
    res.json(map);
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/leagues/:leagueId/notes/:playerId ────────────────────────────────

const upsertNote: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { content } = req.body as { content: string };
    const note = await PlayerNote.findOneAndUpdate(
      {
        leagueId: req.params.id,
        userId: req.user!._id,
        externalPlayerId: req.params.playerId,
      },
      { content: content ?? "" },
      { upsert: true, new: true },
    );
    res.json({ content: note.content });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:id/watchlist ───────────────────────────────────────────

const getWatchlist: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const entries = await WatchlistEntry.find({
      leagueId: req.params.id,
      userId: req.user!._id,
    }).sort({ createdAt: 1 });
    res.json(
      entries.map((e) => ({
        id: e.externalPlayerId,
        name: e.playerName,
        team: e.playerTeam,
        position: e.playerPosition,
        positions: e.playerPositions,
        adp: e.adp,
        value: e.value,
        tier: e.tier,
      })),
    );
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/leagues/:id/watchlist/:playerId ─────────────────────────────────

const upsertWatchlistEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, team, position, positions, adp, value, tier } = req.body as {
      name: string;
      team?: string;
      position?: string;
      positions?: string[];
      adp?: number;
      value?: number;
      tier?: number;
    };
    await WatchlistEntry.findOneAndUpdate(
      {
        leagueId: req.params.id,
        userId: req.user!._id,
        externalPlayerId: req.params.playerId,
      },
      {
        playerName: name,
        playerTeam: team ?? "",
        playerPosition: position ?? "",
        playerPositions: positions ?? [],
        adp: adp ?? 0,
        value: value ?? 0,
        tier: tier ?? 5,
      },
      { upsert: true, new: true },
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/leagues/:id/watchlist/:playerId ──────────────────────────────

const deleteWatchlistEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await WatchlistEntry.findOneAndDelete({
      leagueId: req.params.id,
      userId: req.user!._id,
      externalPlayerId: req.params.playerId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── Route registration ────────────────────────────────────────────────────────

router.post("/", validate(createLeagueSchema), createLeague);
router.get("/", getMyLeagues);
router.get("/:id", getLeague);
router.patch("/:id", validate(updateLeagueSchema), updateLeague);
router.get("/:id/roster", getRoster);
router.post("/:id/roster", validate(addRosterEntrySchema), addRosterEntry);
router.patch("/:id/roster/:entryId", updateRosterEntry);
router.delete("/:id/roster/:entryId", removeRosterEntry);
router.get("/:id/notes", getNotes);
router.put("/:id/notes/:playerId", upsertNote);
router.get("/:id/watchlist", getWatchlist);
router.put("/:id/watchlist/:playerId", upsertWatchlistEntry);
router.delete("/:id/watchlist/:playerId", deleteWatchlistEntry);

export default router;
