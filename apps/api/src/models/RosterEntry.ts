import mongoose, { Document, Schema } from "mongoose";

export interface IRosterEntry extends Document {
  leagueId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  teamId: string;
  externalPlayerId: string;
  playerName: string;
  playerTeam: string;
  positions: string[];
  price: number;
  rosterSlot: string;
  isKeeper: boolean;
  keeperContract?: string;
  acquiredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rosterEntrySchema = new Schema<IRosterEntry>(
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
    teamId: {
      type: String,
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
    positions: [
      {
        type: String,
      },
    ],
    price: {
      type: Number,
      required: true,
      min: 1,
    },
    rosterSlot: {
      type: String,
      required: true, // e.g. "OF1", "SP2", "BN1"
    },
    acquiredAt: {
      type: Date,
      default: Date.now,
    },
    isKeeper: {
      type: Boolean,
      default: false,
    },
    keeperContract: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

// One player per league — a player can only be on one team at a time
rosterEntrySchema.index(
  { leagueId: 1, externalPlayerId: 1 },
  { unique: true },
);

export default mongoose.model<IRosterEntry>("RosterEntry", rosterEntrySchema);
