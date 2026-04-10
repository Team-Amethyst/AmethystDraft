/**
 * POST /api/players/custom
 *
 * Saves a manually created custom player to MongoDB.
 * These are players not found in the MLB Stats API that a user adds during
 * their draft. They are stored in a separate "customPlayers" collection
 * and merged with MLB API data on the frontend.
 *
 * Body: Player object (see Player type on frontend)
 * Returns: { player, message }
 */

import { Router, Request, Response, RequestHandler } from "express";
import mongoose, { Schema, Document } from "mongoose";

const router: Router = Router();

// ─── Mongoose model ───────────────────────────────────────────────────────────
// Defined inline here to avoid a separate model file for a simple schema.
// If this grows, move to models/CustomPlayer.ts.

interface ICustomPlayer extends Document {
  id: string;
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
  id:       { type: String, required: true, unique: true },
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
    batting: { avg: String, hr: Number, rbi: Number, runs: Number, sb: Number },
    pitching: { era: String, whip: String, wins: Number, saves: Number, strikeouts: Number },
  },
  createdAt: { type: Date, default: Date.now },
});

// Avoid re-registering the model on hot reloads
const CustomPlayer =
  mongoose.models.CustomPlayer ??
  mongoose.model<ICustomPlayer>("CustomPlayer", CustomPlayerSchema);

// ─── POST /api/players/custom ─────────────────────────────────────────────────

const createCustomPlayer: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Partial<ICustomPlayer>;

    // Basic server-side validation
    if (!body.name?.trim()) {
      res.status(400).json({ message: "Player name is required" });
      return;
    }
    if (!body.team?.trim()) {
      res.status(400).json({ message: "Team is required" });
      return;
    }
    if (!body.position) {
      res.status(400).json({ message: "Position is required" });
      return;
    }
    if (!body.id) {
      res.status(400).json({ message: "Player id is required" });
      return;
    }

    // Upsert — if the same client sends the same player twice (e.g. after a retry),
    // just update rather than error out on the unique constraint.
    const player = await CustomPlayer.findOneAndUpdate(
      { id: body.id },
      { $set: body },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ player, message: "Custom player saved" });
  } catch (err) {
    console.error("Custom player save error:", err);
    res.status(500).json({ message: "Failed to save custom player" });
  }
};

// ─── GET /api/players/custom ──────────────────────────────────────────────────
// Optional: fetch all custom players for a session restore.
// TODO(auth): Filter by leagueId or userId once auth middleware is wired.

const getCustomPlayers: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const players = await CustomPlayer.find({}).sort({ createdAt: -1 }).lean();
    res.json({ players, count: players.length });
  } catch (err) {
    console.error("Custom player fetch error:", err);
    res.status(500).json({ message: "Failed to fetch custom players" });
  }
};

router.post("/", createCustomPlayer);
router.get("/",  getCustomPlayers);

export default router;