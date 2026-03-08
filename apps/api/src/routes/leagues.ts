import { Router, RequestHandler, Response } from "express";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import PlayerNote from "../models/PlayerNote";
import WatchlistEntry from "../models/WatchlistEntry";
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
      posEligibilityThreshold,
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
      posEligibilityThreshold: posEligibilityThreshold ?? 20,
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
      teamId: bodyTeamId,
      isKeeper,
    } = req.body;
    const memberIds = league.memberIds.map(String);
    const requesterId = String(req.user!._id);
    const isCommissioner = String(league.commissionerId) === requesterId;
    if (userId && userId !== requesterId && !isCommissioner) {
      res.status(403).json({
        message: "Only the commissioner can add entries for other teams",
      });
      return;
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

// ─── PATCH /api/leagues/:id/roster/:entryId ──────────────────────────────────

const updateRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { price, rosterSlot, teamId } = req.body as {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
    };
    const update: Record<string, unknown> = {};
    if (price !== undefined) update.price = price;
    if (rosterSlot !== undefined) update.rosterSlot = rosterSlot;
    if (teamId !== undefined) {
      const teamIndex = parseInt(teamId.replace("team_", ""), 10) - 1;
      if (isNaN(teamIndex) || teamIndex < 0) {
        res.status(400).json({ message: "Invalid teamId" });
        return;
      }
      const league = await League.findById(req.params.id);
      if (!league) {
        res.status(404).json({ message: "League not found" });
        return;
      }
      // Check if this player is already on the target team
      const currentEntry = await RosterEntry.findById(
        req.params.entryId,
      ).lean();
      if (currentEntry) {
        const existingOnTarget = await RosterEntry.exists({
          leagueId: req.params.id,
          teamId,
          externalPlayerId: currentEntry.externalPlayerId,
          _id: { $ne: currentEntry._id },
        });
        if (existingOnTarget) {
          res
            .status(409)
            .json({ message: "That player is already on the target team" });
          return;
        }
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
      res.status(404).json({ message: "Entry not found" });
      return;
    }
    res.json(entry);
  } catch (err) {
    console.error("Update roster entry error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/leagues/:leagueId/notes ─────────────────────────────────────────

const getNotes: RequestHandler = async (
  req: AuthRequest,
  res: Response,
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
    console.error("Get notes error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PUT /api/leagues/:leagueId/notes/:playerId ────────────────────────────────

const upsertNote: RequestHandler = async (
  req: AuthRequest,
  res: Response,
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
    console.error("Upsert note error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/leagues/:id/watchlist ───────────────────────────────────────────

const getWatchlist: RequestHandler = async (
  req: AuthRequest,
  res: Response,
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
    console.error("Get watchlist error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PUT /api/leagues/:id/watchlist/:playerId ─────────────────────────────────

const upsertWatchlistEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
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
    console.error("Upsert watchlist entry error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE /api/leagues/:id/watchlist/:playerId ──────────────────────────────

const deleteWatchlistEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    await WatchlistEntry.findOneAndDelete({
      leagueId: req.params.id,
      userId: req.user!._id,
      externalPlayerId: req.params.playerId,
    });
    res.status(204).send();
  } catch (err) {
    console.error("Delete watchlist entry error:", err);
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
router.patch("/:id/roster/:entryId", updateRosterEntry);
router.delete("/:id/roster/:entryId", removeRosterEntry);
router.get("/:id/notes", getNotes);
router.put("/:id/notes/:playerId", upsertNote);
router.get("/:id/watchlist", getWatchlist);
router.put("/:id/watchlist/:playerId", upsertWatchlistEntry);
router.delete("/:id/watchlist/:playerId", deleteWatchlistEntry);

export default router;
