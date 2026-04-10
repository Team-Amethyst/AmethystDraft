import mongoose, { Document, Schema } from "mongoose";

export interface ICustomPlayer extends Document {
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
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      obp: string;
      slg: string;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      strikeouts: number;
      innings: string;
    };
  };
  projection: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      strikeouts: number;
    };
  };
  createdAt: Date;
}

const CustomPlayerSchema = new Schema<ICustomPlayer>({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  mlbId: { type: Number, default: 0 },
  name: { type: String, required: true },
  team: { type: String, required: true },
  position: { type: String, required: true },
  age: { type: Number, default: 0 },
  adp: { type: Number, default: 999 },
  value: { type: Number, default: 0 },
  tier: { type: Number, default: 5 },
  headshot: { type: String, default: "" },
  outlook: { type: String, default: "" },
  stats: {
    batting: {
      avg: String,
      hr: Number,
      rbi: Number,
      runs: Number,
      sb: Number,
      obp: String,
      slg: String,
    },
    pitching: {
      era: String,
      whip: String,
      wins: Number,
      saves: Number,
      strikeouts: Number,
      innings: String,
    },
  },
  projection: {
    batting: { avg: String, hr: Number, rbi: Number, runs: Number, sb: Number },
    pitching: {
      era: String,
      whip: String,
      wins: Number,
      saves: Number,
      strikeouts: Number,
    },
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

export default CustomPlayer;