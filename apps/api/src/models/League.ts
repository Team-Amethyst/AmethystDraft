import { randomUUID } from "node:crypto";
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

/**
 * Standard roster when `POST /api/leagues` omits `rosterSlots` (Mongoose default).
 * Matches web `rosterDefaults` / mobile create payload (Draftroom product default).
 */
export const DRAFTROOM_DEFAULT_ROSTER_SLOTS: IRosterSlots = {
  C: 1,
  "1B": 1,
  "2B": 1,
  SS: 1,
  "3B": 1,
  MI: 1,
  CI: 1,
  OF: 3,
  UTIL: 1,
  SP: 5,
  RP: 2,
  BN: 3,
};

export interface ITaxiRosterEntry {
  playerId: string;
  teamId: string;
  addedAt: string;
  pickNumber?: number;
}

export interface ITaxiRosters {
  [teamId: string]: ITaxiRosterEntry[];
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
  teamNames: string[];
  posEligibilityThreshold: number;
  taxiDraftOrder?: string[];
  taxiRosters?: ITaxiRosters;
  /** Calendar season year for this league document (one document per season). */
  seasonYear: number;
  /** Stable id shared by all yearly `League` docs for the same real-world fantasy league. */
  leagueFamilyId: string;
  /** Prior season’s league `_id` when this row was created via “start new season”. */
  previousSeasonLeagueId?: mongoose.Types.ObjectId;
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
      default: () => ({ ...DRAFTROOM_DEFAULT_ROSTER_SLOTS }),
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
    teamNames: {
      type: [String],
      default: [],
    },
    posEligibilityThreshold: {
      type: Number,
      default: 20,
    },
    taxiDraftOrder: {
      type: [String],
      default: [],
    },
    taxiRosters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    seasonYear: {
      type: Number,
      default() {
        return new Date().getFullYear();
      },
      index: true,
    },
    leagueFamilyId: {
      type: String,
      default() {
        return randomUUID();
      },
    },
    previousSeasonLeagueId: {
      type: Schema.Types.ObjectId,
      ref: "League",
    },
  },
  { timestamps: true },
);

leagueSchema.index({ leagueFamilyId: 1, seasonYear: -1 });

export default mongoose.model<ILeague>("League", leagueSchema);
