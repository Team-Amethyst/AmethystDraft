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
import mongoose, { Schema, Document } from "mongoose";
import authMiddleware from "../middleware/auth";
import type { AuthRequest } from "../middleware/auth";
import { ValidationError, UnauthorizedError } from "../lib/appError";

const router: Router = Router();

// ─── Mongoose model ───────────────────────────────────────────────────────────

interface ICustomPlayer extends Document {
  id: string;
  userId: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
  age: number;
  adp: number;
  value: number;
  tier: number;
  headshot: string;
  outlook: string;
  stats: {
    batting?: {
      avg: string; hr: number; rbi: number;
      runs: number; sb: number; obp: string; slg: string;
    };
    pitching?: {
      era: string; whip: string; wins: number;
      saves: number; strikeouts: number; innings: string;
    };
  };
  projection: {
    batting?: { avg: string; hr: number; rbi: number; runs: number; sb: number };
    pitching?: { era: string; whip: string; wins: number; saves: number; strikeouts: number };
  };
  createdAt: Date;
}

const CustomPlayerSchema = new Schema<ICustomPlayer>({
  id:       { type: String, required: true },
  userId:   { type: String, required: true },
  mlbId:    { type: Number, default: 0 },
  name:     { type: String, required: true },
  team:     { type: String, required: true },
  position: { type: String, required: true },
  age:      { type: Number, default: 0 },
  adp:      { type: Number, default: 999 },
  value:    { type: Number, default: 0 },
  tier:     { type: Number, default: 5 },
  headshot: { type: String, default: "" },
  outlook:  { type: String, default: "" },
  stats: {
    batting: {
      avg: String, hr: Number, rbi: Number,
      runs: Number, sb: Number, obp: String, slg: String,
    },
    pitching: {
      era: String, whip: String, wins: Number,
      saves: Number, strikeouts: Number, innings: String,
    },
  },
  projection: {
    batting:  { avg: String, hr: Number, rbi: Number, runs: Number, sb: Number },
    pitching: { era: String, whip: String, wins: Number, saves: Number, strikeouts: Number },
  },
  createdAt: { type: Date, default: Date.now },
});

// Compound unique index: same player id can exist for different users,
// but a user cannot create the same player twice.
CustomPlayerSchema.index({ id: 1, userId: 1 }, { unique: true });

// Avoid re-registering the model on hot reloads
const CustomPlayer =
  mongoose.models.CustomPlayer ??
  mongoose.model<ICustomPlayer>("CustomPlayer", CustomPlayerSchema);

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