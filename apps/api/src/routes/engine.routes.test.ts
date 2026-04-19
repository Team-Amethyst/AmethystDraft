import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import mongoose from "mongoose";
import { AxiosError } from "axios";

const postMock = vi.fn();
const getMock = vi.fn();

vi.mock("../lib/amethyst", () => ({
  amethyst: {
    post: (...args: unknown[]) => postMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

vi.mock("../middleware/auth", () => ({
  default: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { _id: string } }).user = {
      _id: "507f1f77bcf86cd799439011",
    };
    next();
  }),
}));

vi.mock("../models/League", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../models/RosterEntry", () => ({
  default: {
    find: vi.fn(),
  },
}));

import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import engineRouter from "./engine";
import errorHandler from "../middleware/errorHandler";
import { assignRequestId } from "../lib/requestContext";

function makeEngineApp() {
  const app = express();
  app.use(express.json());
  app.use(assignRequestId);
  app.use("/api/engine", engineRouter);
  app.use(errorHandler);
  return app;
}

const leagueOid = new mongoose.Types.ObjectId();

const mockLeagueDoc = {
  _id: leagueOid,
  rosterSlots: { OF: 2, C: 1 },
  scoringCategories: [{ name: "HR", type: "batting" as const }],
  budget: 260,
  teams: 2,
  playerPool: "Mixed" as const,
  memberIds: [
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
  ],
  scoringFormat: "5x5" as const,
  hitterBudgetPct: 70,
  posEligibilityThreshold: 20,
};

describe("engine routes (BFF → Amethyst)", () => {
  const app = makeEngineApp();
  const lid = leagueOid.toString();

  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
    vi.mocked(League.findById).mockResolvedValue(mockLeagueDoc as never);
    vi.mocked(RosterEntry.find).mockResolvedValue([] as never);
  });

  describe("POST /api/engine/leagues/:leagueId/valuation", () => {
    it("returns 404 when league is missing", async () => {
      vi.mocked(League.findById).mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/valuation`)
        .set("Authorization", "Bearer t");

      expect(res.status).toBe(404);
      expect(postMock).not.toHaveBeenCalled();
    });

    it("proxies to POST /valuation/calculate with finalized payload", async () => {
      postMock.mockResolvedValue({
        data: {
          inflation_factor: 1,
          valuations: [],
          calculated_at: "x",
        },
        headers: { "x-request-id": "engine-val-1" },
      });

      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/valuation`)
        .set("Authorization", "Bearer t");

      expect(res.status).toBe(200);
      expect(res.body.inflation_factor).toBe(1);
      expect(res.headers["x-request-id"]).toBe("engine-val-1");
      expect(postMock).toHaveBeenCalledTimes(1);
      const [path, body] = postMock.mock.calls[0] ?? [];
      expect(path).toBe("/valuation/calculate");
      const payload = body as {
        num_teams: number;
        league_scope: string;
        schema_version?: string;
        schemaVersion?: string;
      };
      expect(payload.num_teams).toBe(2);
      expect(payload.league_scope).toBe("Mixed");
      expect(payload.schema_version).toBeUndefined();
      expect(payload.schemaVersion).toBeUndefined();
    });
  });

  describe("POST /api/engine/leagues/:leagueId/valuation/player", () => {
    it("proxies to POST /valuation/player with player_id merged into payload", async () => {
      postMock.mockResolvedValue({
        data: {
          engine_contract_version: "1",
          inflation_factor: 1.1,
          player: { player_id: "660271", name: "X", adjusted_value: 40 },
          valuations: [],
          calculated_at: "t",
        },
        headers: {},
      });

      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/valuation/player`)
        .set("Authorization", "Bearer t")
        .send({ player_id: "660271" });

      expect(res.status).toBe(200);
      expect(postMock).toHaveBeenCalledWith(
        "/valuation/player",
        expect.objectContaining({
          player_id: "660271",
          num_teams: 2,
          league_scope: "Mixed",
        }),
      );
    });

    it("returns 400 when player_id is missing", async () => {
      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/valuation/player`)
        .set("Authorization", "Bearer t")
        .send({});

      expect(res.status).toBe(400);
      expect(postMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/engine/catalog/batch-values", () => {
    it("forwards body to POST /catalog/batch-values", async () => {
      postMock.mockResolvedValue({
        data: { engine_contract_version: "1", players: [] },
        headers: {},
      });

      const res = await request(app)
        .post("/api/engine/catalog/batch-values")
        .set("Authorization", "Bearer t")
        .send({
          player_ids: ["1", "2"],
          league_scope: "Mixed",
          pos_eligibility_threshold: 20,
        });

      expect(res.status).toBe(200);
      expect(postMock).toHaveBeenCalledWith("/catalog/batch-values", {
        player_ids: ["1", "2"],
        league_scope: "Mixed",
        pos_eligibility_threshold: 20,
      });
    });

    it("returns 400 when player_ids is empty", async () => {
      const res = await request(app)
        .post("/api/engine/catalog/batch-values")
        .set("Authorization", "Bearer t")
        .send({ player_ids: [] });

      expect(res.status).toBe(400);
      expect(postMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/engine/leagues/:leagueId/scarcity", () => {
    it("forwards optional position query to engine body", async () => {
      postMock.mockResolvedValue({
        data: { positions: [] },
        headers: {},
      });

      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/scarcity?position=SS`)
        .set("Authorization", "Bearer t");

      expect(res.status).toBe(200);
      expect(postMock).toHaveBeenCalledWith(
        "/analysis/scarcity",
        expect.objectContaining({ position: "SS" }),
      );
    });
  });

  describe("POST /api/engine/leagues/:leagueId/mock-pick", () => {
    it("sends simulation context to /simulation/mock-pick", async () => {
      postMock.mockResolvedValue({
        data: { predictions: [] },
        headers: {},
      });

      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/mock-pick`)
        .set("Authorization", "Bearer t")
        .send({
          budgetByTeamId: { team_1: 200, team_2: 180 },
          availablePlayerIds: ["1", "2"],
        });

      expect(res.status).toBe(200);
      expect(postMock).toHaveBeenCalledWith(
        "/simulation/mock-pick",
        expect.objectContaining({
          teams: expect.any(Array),
          available_player_ids: ["1", "2"],
        }),
      );
    });

    it("returns 400 when budget is negative", async () => {
      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/mock-pick`)
        .set("Authorization", "Bearer t")
        .send({ budgetByTeamId: { team_1: -1 } });

      expect(res.status).toBe(400);
      expect(postMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/engine/signals/news", () => {
    it("forwards query params to engine", async () => {
      getMock.mockResolvedValue({
        data: { signals: [], count: 0 },
        headers: {},
      });

      const res = await request(app)
        .get("/api/engine/signals/news?days=5&signal_type=injury")
        .set("Authorization", "Bearer t");

      expect(res.status).toBe(200);
      expect(getMock).toHaveBeenCalledWith("/signals/news", {
        params: { days: "5", signal_type: "injury" },
      });
    });

    it("returns 400 for invalid days", async () => {
      const res = await request(app)
        .get("/api/engine/signals/news?days=99")
        .set("Authorization", "Bearer t");

      expect(res.status).toBe(400);
      expect(getMock).not.toHaveBeenCalled();
    });
  });

  describe("engine upstream errors", () => {
    it("surfaces Engine 502 via error handler", async () => {
      postMock.mockRejectedValue(
        Object.assign(new AxiosError("bad gateway"), {
          response: { status: 502, data: { error: "down" } },
        }),
      );

      const res = await request(app)
        .post(`/api/engine/leagues/${lid}/valuation`)
        .set("Authorization", "Bearer t");

      expect(res.status).toBe(502);
      expect(res.body.error?.code).toBe("ENGINE_UPSTREAM_ERROR");
    });
  });
});
