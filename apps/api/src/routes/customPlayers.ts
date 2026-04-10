/**
 * POST /api/players/custom
 * GET  /api/players/custom
 *
 * Saves and retrieves manually created custom players, scoped to the
 * authenticated user. Players created by one user are never visible to others.
 *
 * Body: Player object (see Player type on frontend)
 * Returns: { player, message } or { players, count }
 */

import { Router, Response, RequestHandler, NextFunction } from "express";
import authMiddleware from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";
import CustomPlayer, { type ICustomPlayer } from "../models/CustomPlayer";
import { ValidationError, UnauthorizedError } from "../lib/appError";

const router: Router = Router();

// ─── POST /api/players/custom ─────────────────────────────────────────────────

const createCustomPlayer: RequestHandler = async (req: AuthRequest, res: Response, next: Function): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      // res.status(401).json({ message: "Unauthorized" });
      // return;
      throw new UnauthorizedError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const body = req.body as Partial<ICustomPlayer>;

    if (!body.name?.trim()) {
      // res.status(400).json({ message: "Player name is required" });
      // return;
      throw new ValidationError("Player name is required", 400, "NAME_REQUIRED");
    }
    if (!body.team?.trim()) {
      // res.status(400).json({ message: "Team is required" });
      // return;
      throw new ValidationError("Team is required", 400, "TEAM_REQUIRED");
    }
    if (!body.position) {
      // res.status(400).json({ message: "Position is required" });
      // return;
      throw new ValidationError("Position is required", 400, "POSITION_REQUIRED");
    }
    if (!body.id) {
      // res.status(400).json({ message: "Player id is required" });
      // return;
      throw new ValidationError("Player id is required", 400, "ID_REQUIRED");
    }

    // Upsert scoped to this user — same player sent twice just updates, not errors
    const player = await CustomPlayer.findOneAndUpdate(
      { id: body.id, userId },
      { $set: { ...body, userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ player, message: "Custom player saved" });
  } catch (err) {
    // console.error("Custom player save error:", err);
    // res.status(500).json({ message: "Failed to save custom player" });
    next(err);
  }
};

// ─── GET /api/players/custom ──────────────────────────────────────────────────

const getCustomPlayers: RequestHandler = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      // res.status(401).json({ message: "Unauthorized" });
      // return;
      throw new UnauthorizedError("Unauthorized", 401, "UNAUTHORIZED");
    }

    // Only return players created by this user
    const players = await CustomPlayer.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ players, count: players.length });
  } catch (err) {
    // console.error("Custom player fetch error:", err);
    // res.status(500).json({ message: "Failed to fetch custom players" });
    next(err);
  }
};

// Auth middleware applied to both routes
router.post("/", authMiddleware, createCustomPlayer);
router.get("/",  authMiddleware, getCustomPlayers);

export default router;