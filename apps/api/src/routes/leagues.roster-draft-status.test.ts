import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import mongoose from "mongoose";
import type { AuthRequest } from "../middleware/auth";

const userOid = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
const leagueOid = new mongoose.Types.ObjectId("507f1f77bcf86cd799439012");

const {
  rosterCreate,
  rosterFind,
  rosterFindOne,
  rosterFindOneAndUpdate,
  rosterInsertMany,
  leagueFindOne,
  leagueFindById,
  syncDraftStatus,
} = vi.hoisted(() => ({
  rosterCreate: vi.fn(),
  rosterFind: vi.fn(),
  rosterFindOne: vi.fn(),
  rosterFindOneAndUpdate: vi.fn(),
  rosterInsertMany: vi.fn(),
  leagueFindOne: vi.fn(),
  leagueFindById: vi.fn(),
  syncDraftStatus: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  default: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as AuthRequest).user = { _id: userOid };
    next();
  }),
}));

vi.mock("../lib/draftStatus", () => ({
  syncLeagueDraftStatus: (...a: unknown[]) => syncDraftStatus(...a),
}));

vi.mock("../models/League", () => ({
  default: {
    find: vi.fn(),
    findOne: (...a: unknown[]) => leagueFindOne(...a),
    findById: (...a: unknown[]) => leagueFindById(...a),
    create: vi.fn(),
  },
}));

vi.mock("../models/RosterEntry", () => ({
  default: {
    find: rosterFind,
    create: (...a: unknown[]) => rosterCreate(...a),
    findOne: (...a: unknown[]) => rosterFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => rosterFindOneAndUpdate(...a),
    insertMany: (...a: unknown[]) => rosterInsertMany(...a),
  },
}));

vi.mock("../models/PlayerNote", () => ({ default: {} }));
vi.mock("../models/WatchlistEntry", () => ({ default: {} }));

import leaguesRouter from "./leagues";
import errorHandler from "../middleware/errorHandler";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/leagues", leaguesRouter);
  app.use(errorHandler);
  return app;
}

function leagueDoc(overrides: Record<string, unknown> = {}) {
  const _id = (overrides._id as mongoose.Types.ObjectId) ?? leagueOid;
  const base = {
    _id,
    name: "L",
    commissionerId: userOid,
    memberIds: [userOid],
    budget: 260,
    teams: 2,
    rosterSlots: { C: 1 },
    draftStatus: "pre-draft",
    scoringFormat: "5x5",
    scoringCategories: [],
    playerPool: "Mixed",
    teamNames: ["A", "B"],
    posEligibilityThreshold: 20,
    seasonYear: 2026,
    leagueFamilyId: "fam",
    ...overrides,
  };
  return {
    ...base,
    toObject() {
      return { ...base };
    },
  };
}

describe("roster routes sync draftStatus", () => {
  const app = makeApp();

  beforeEach(() => {
    vi.clearAllMocks();
    syncDraftStatus.mockResolvedValue("in-progress");
    leagueFindOne.mockResolvedValue(leagueDoc());
  });

  it("POST roster syncs draft status after create", async () => {
    rosterCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      leagueId: leagueOid,
      isKeeper: false,
      rosterSlot: "C",
    });

    await request(app)
      .post(`/api/leagues/${leagueOid}/roster`)
      .send({
        externalPlayerId: "1",
        playerName: "P",
        price: 10,
        rosterSlot: "C",
        isKeeper: false,
      })
      .expect(201);

    expect(syncDraftStatus).toHaveBeenCalledWith(leagueOid);
  });

  it("POST import-keepers syncs draft status", async () => {
    const fromId = new mongoose.Types.ObjectId();
    leagueFindOne.mockResolvedValue(
      leagueDoc({ leagueFamilyId: "fam", commissionerId: userOid }),
    );
    leagueFindById.mockResolvedValue(
      leagueDoc({ _id: fromId, leagueFamilyId: "fam", memberIds: [userOid] }),
    );
    rosterFind.mockResolvedValue([
      { isKeeper: true, teamId: "team_1", positions: [], price: 1 },
    ]);
    rosterInsertMany.mockResolvedValue([]);

    await request(app)
      .post(`/api/leagues/${leagueOid}/import-keepers`)
      .send({ fromLeagueId: String(fromId) })
      .expect(201);

    expect(syncDraftStatus).toHaveBeenCalledWith(leagueOid);
  });
});
