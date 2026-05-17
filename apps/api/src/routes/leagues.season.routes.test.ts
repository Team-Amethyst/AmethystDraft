import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import mongoose from "mongoose";
import type { AuthRequest } from "../middleware/auth";

const userOid = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");

const {
  rosterFind,
  rosterInsertMany,
  leagueFindOne,
  leagueFindById,
  leagueCreate,
} = vi.hoisted(() => ({
  rosterFind: vi.fn(),
  rosterInsertMany: vi.fn(),
  leagueFindOne: vi.fn(),
  leagueFindById: vi.fn(),
  leagueCreate: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  default: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as AuthRequest).user = { _id: userOid };
    next();
  }),
}));

vi.mock("../models/League", () => ({
  default: {
    find: vi.fn(),
    findOne: (...a: unknown[]) => leagueFindOne(...a),
    findById: (...a: unknown[]) => leagueFindById(...a),
    create: (...a: unknown[]) => leagueCreate(...a),
  },
}));

vi.mock("../models/RosterEntry", () => ({
  default: {
    find: rosterFind,
    insertMany: rosterInsertMany,
  },
}));

vi.mock("../models/PlayerNote", () => ({ default: {} }));
vi.mock("../models/WatchlistEntry", () => ({ default: {} }));

import RosterEntry from "../models/RosterEntry";
import leaguesRouter from "./leagues";
import errorHandler from "../middleware/errorHandler";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/leagues", leaguesRouter);
  app.use(errorHandler);
  return app;
}

function leagueDoc(overrides: Record<string, unknown>) {
  const _id = (overrides._id as mongoose.Types.ObjectId) ?? new mongoose.Types.ObjectId();
  const base = {
    _id,
    name: "L",
    commissionerId: userOid,
    memberIds: [userOid],
    budget: 260,
    hitterBudgetPct: 70,
    teams: 12,
    scoringFormat: "5x5",
    scoringCategories: [] as { name: string; type: "batting" | "pitching" }[],
    rosterSlots: { C: 1 },
    draftStatus: "completed",
    isPublic: false,
    playerPool: "Mixed",
    teamNames: [] as string[],
    posEligibilityThreshold: 20,
    seasonYear: 2026,
    leagueFamilyId: "fam-x",
    taxiDraftOrder: [] as string[],
    taxiRosters: {},
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
    ...overrides,
  };
  return {
    ...base,
    toObject() {
      return { ...base };
    },
  };
}

describe("leagues season routes", () => {
  const app = makeApp();

  beforeEach(() => {
    leagueFindOne.mockReset();
    leagueFindById.mockReset();
    leagueCreate.mockReset();
    rosterFind.mockReset();
    rosterInsertMany.mockReset();
  });

  it("POST /:id/start-new-season returns 404 when league missing", async () => {
    leagueFindOne.mockResolvedValueOnce(null);
    const id = new mongoose.Types.ObjectId().toString();
    await request(app).post(`/api/leagues/${id}/start-new-season`).send({}).expect(404);
  });

  it("POST /:id/start-new-season creates next season without touching roster model", async () => {
    const oldId = new mongoose.Types.ObjectId();
    const src = leagueDoc({
      _id: oldId,
      commissionerId: userOid,
      seasonYear: 2026,
      leagueFamilyId: "fam-x",
    });
    leagueFindOne.mockResolvedValueOnce(src);

    const newId = new mongoose.Types.ObjectId();
    leagueCreate.mockImplementationOnce(async (payload: Record<string, unknown>) =>
      leagueDoc({
        _id: newId,
        ...payload,
        previousSeasonLeagueId: payload.previousSeasonLeagueId,
      }),
    );

    const res = await request(app).post(`/api/leagues/${oldId.toString()}/start-new-season`).send({}).expect(201);

    expect(res.body.seasonYear).toBe(2027);
    expect(res.body.leagueFamilyId).toBe("fam-x");
    expect(res.body.previousSeasonLeagueId).toBe(oldId.toString());
    expect(res.body.budget).toBe(260);
    expect(RosterEntry.find).not.toHaveBeenCalled();
    expect(RosterEntry.insertMany).not.toHaveBeenCalled();
    expect(leagueCreate).toHaveBeenCalledTimes(1);
    const createdArg = leagueCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(createdArg.seasonYear).toBe(2027);
    expect(createdArg.previousSeasonLeagueId).toEqual(oldId);
  });

  it("POST /:id/import-keepers copies only keeper rows and does not modify source league", async () => {
    const newLeagueId = new mongoose.Types.ObjectId();
    const fromLeagueId = new mongoose.Types.ObjectId();

    const newLeague = leagueDoc({
      _id: newLeagueId,
      commissionerId: userOid,
      seasonYear: 2027,
      leagueFamilyId: "fam-x",
    });
    const fromLeague = leagueDoc({
      _id: fromLeagueId,
      commissionerId: new mongoose.Types.ObjectId(),
      seasonYear: 2026,
      leagueFamilyId: "fam-x",
      memberIds: [userOid],
    });

    leagueFindOne.mockResolvedValueOnce(newLeague);
    leagueFindById.mockResolvedValueOnce(fromLeague);

    const keeper = {
      leagueId: fromLeagueId,
      userId: userOid,
      teamId: "t1",
      externalPlayerId: "p1",
      playerName: "Player",
      playerTeam: "NYY",
      positions: ["OF"],
      price: 12,
      rosterSlot: "OF1",
      isKeeper: true,
      keeperContract: "Y1",
      acquiredAt: new Date(),
    };
    rosterFind.mockResolvedValueOnce([keeper]);

    rosterInsertMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .post(`/api/leagues/${newLeagueId.toString()}/import-keepers`)
      .send({ fromLeagueId: fromLeagueId.toString() })
      .expect(201);

    expect(res.body.imported).toBe(1);
    expect(rosterInsertMany).toHaveBeenCalledTimes(1);
    const inserted = rosterInsertMany.mock.calls[0][0] as Record<string, unknown>[];
    expect(inserted).toHaveLength(1);
    expect(inserted[0].leagueId).toEqual(newLeagueId);
    expect(inserted[0].isKeeper).toBe(true);
    expect(inserted[0].externalPlayerId).toBe("p1");
  });

  it("POST /:id/import-keepers rejects family mismatch", async () => {
    const newLeagueId = new mongoose.Types.ObjectId();
    const fromLeagueId = new mongoose.Types.ObjectId();
    leagueFindOne.mockResolvedValueOnce(
      leagueDoc({ _id: newLeagueId, leagueFamilyId: "a", commissionerId: userOid }),
    );
    leagueFindById.mockResolvedValueOnce(
      leagueDoc({ _id: fromLeagueId, leagueFamilyId: "b", memberIds: [userOid] }),
    );

    await request(app)
      .post(`/api/leagues/${newLeagueId.toString()}/import-keepers`)
      .send({ fromLeagueId: fromLeagueId.toString() })
      .expect(400);

    expect(rosterInsertMany).not.toHaveBeenCalled();
  });

  it("POST /api/leagues assigns seasonYear and leagueFamilyId on create", async () => {
    const createdId = new mongoose.Types.ObjectId();
    leagueCreate.mockImplementationOnce(async (payload: Record<string, unknown>) =>
      leagueDoc({
        _id: createdId,
        ...payload,
        draftStatus: "pre-draft",
      }),
    );

    const res = await request(app)
      .post("/api/leagues")
      .send({
        name: "Fresh",
        teams: 12,
        budget: 260,
        rosterSlots: { C: 1 },
        scoringCategories: [],
        playerPool: "Mixed",
      })
      .expect(201);

    expect(typeof res.body.seasonYear).toBe("number");
    expect(res.body.seasonYear).toBe(new Date().getFullYear());
    expect(typeof res.body.leagueFamilyId).toBe("string");
    expect(res.body.leagueFamilyId.length).toBeGreaterThan(10);
    const createPayload = leagueCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(createPayload.seasonYear).toBe(new Date().getFullYear());
    expect(typeof createPayload.leagueFamilyId).toBe("string");
  });
});
