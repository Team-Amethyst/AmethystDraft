import mongoose, { Document, Schema } from "mongoose";

export interface IWatchlistEntry extends Document {
  leagueId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  externalPlayerId: string;
  playerName: string;
  playerTeam: string;
  playerPosition: string;
  playerPositions: string[];
  adp: number;
  value: number;
  tier: number;
  baselineValue?: number;
  adjustedValue?: number;
  recommendedBid?: number;
  teamAdjustedValue?: number;
  personalRank: number | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const watchlistEntrySchema = new Schema<IWatchlistEntry>(
  {
    leagueId: {
      type: Schema.Types.ObjectId,
      ref: "League",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    externalPlayerId: {
      type: String,
      required: true,
    },
    playerName: {
      type: String,
      required: true,
    },
    playerTeam: {
      type: String,
      default: "",
    },
    playerPosition: {
      type: String,
      default: "",
    },
    playerPositions: {
      type: [String],
      default: [],
    },
    adp: {
      type: Number,
      default: 0,
    },
    value: {
      type: Number,
      default: 0,
    },
    tier: {
      type: Number,
      default: 5,
    },
    baselineValue: {
      type: Number,
    },
    adjustedValue: {
      type: Number,
    },
    recommendedBid: {
      type: Number,
    },
    teamAdjustedValue: {
      type: Number,
    },
    personalRank: {
      type: Number,
      default: null,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

// Compound index: one watchlist entry per player per user per league
watchlistEntrySchema.index(
  { leagueId: 1, userId: 1, externalPlayerId: 1 },
  { unique: true },
);

export default mongoose.model<IWatchlistEntry>(
  "WatchlistEntry",
  watchlistEntrySchema,
);
