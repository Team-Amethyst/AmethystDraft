import mongoose, { Document, Schema } from "mongoose";

export type DraftStatus = "pre-draft" | "in-progress" | "completed";
export type ScoringFormat = "5x5" | "6x6" | "points";
export type PlayerPool = "Mixed" | "AL" | "NL";

export interface IScoringCategory {
  name: string;
  type: "batting" | "pitching";
}

// Roster slots stored as a plain object instead of Map to avoid TS schema conflicts
export interface IRosterSlots {
  [key: string]: number;
}

export interface ILeague extends Document {
  name: string;
  commissionerId: mongoose.Types.ObjectId;
  memberIds: mongoose.Types.ObjectId[];
  budget: number;
  hitterBudgetPct: number;
  teams: number;
  scoringFormat: ScoringFormat;
  scoringCategories: IScoringCategory[];
  rosterSlots: IRosterSlots;
  draftStatus: DraftStatus;
  isPublic: boolean;
  draftDate?: Date;
  playerPool: PlayerPool;
  createdAt: Date;
  updatedAt: Date;
}

const leagueSchema = new Schema<ILeague>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    commissionerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    memberIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    budget: {
      type: Number,
      default: 260,
    },
    hitterBudgetPct: {
      type: Number,
      default: 70,
    },
    teams: {
      type: Number,
      default: 12,
    },
    scoringFormat: {
      type: String,
      enum: ["5x5", "6x6", "points"],
      default: "5x5",
    },
    // Using Schema.Types.Mixed for flexible key-value roster slot config
    rosterSlots: {
      type: Schema.Types.Mixed,
      default: {
        C: 1,
        "1B": 1,
        "2B": 1,
        "3B": 1,
        SS: 1,
        OF: 3,
        UTIL: 1,
        SP: 2,
        RP: 2,
        P: 3,
        BN: 5,
      },
    },
    draftStatus: {
      type: String,
      enum: ["pre-draft", "in-progress", "completed"],
      default: "pre-draft",
    },
    scoringCategories: [
      {
        name: { type: String, required: true },
        type: { type: String, enum: ["batting", "pitching"], required: true },
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },
    draftDate: {
      type: Date,
    },
    playerPool: {
      type: String,
      enum: ["Mixed", "AL", "NL"],
      default: "Mixed",
    },
  },
  { timestamps: true },
);

export default mongoose.model<ILeague>("League", leagueSchema);
