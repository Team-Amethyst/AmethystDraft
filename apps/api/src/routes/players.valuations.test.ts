import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "fs";
import path from "path";
import { AxiosError } from "axios";

const postMock = vi.fn();

vi.mock("../lib/amethyst", () => ({
  amethyst: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import playersRouter from "./players";
import errorHandler from "../middleware/errorHandler";

const checkpointsDir = path.join(
  process.cwd(),
  "test-fixtures",
  "player-api",
  "checkpoints",
);

const preDraftFixture = JSON.parse(
  readFileSync(path.join(checkpointsDir, "pre_draft.json"), "utf8"),
) as Record<string, unknown>;

function makeValuationsApp() {
  const app = express();
  app.use(express.json());
  app.use(playersRouter);
  app.use(errorHandler);
  return app;
}

describe("POST /valuations (fixture valuations)", () => {
  const app = makeValuationsApp();

  const prevKey = process.env.PLAYER_API_TEST_KEY;

  beforeEach(() => {
    process.env.PLAYER_API_TEST_KEY = "test-secret";
    postMock.mockReset();
    postMock.mockResolvedValue({
      data: { inflation_factor: 1.05, valuations: [], calculated_at: "t" },
    });
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.PLAYER_API_TEST_KEY;
    } else {
      process.env.PLAYER_API_TEST_KEY = prevKey;
    }
  });

  it("returns 503 when PLAYER_API_TEST_KEY is unset", async () => {
    delete process.env.PLAYER_API_TEST_KEY;
    const res = await request(app).post("/valuations").send(preDraftFixture);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("PLAYER_API_TESTING_DISABLED");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a valid key", async () => {
    const res = await request(app).post("/valuations").send(preDraftFixture);
    expect(res.status).toBe(401);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body when authenticated", async () => {
    const res = await request(app)
      .post("/valuations")
      .set("x-player-api-key", "test-secret")
      .send({ notAFixture: true });
    expect(res.status).toBe(400);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("proxies to engine and returns JSON (Bearer auth)", async () => {
    const res = await request(app)
      .post("/valuations")
      .set("Authorization", "Bearer test-secret")
      .send(preDraftFixture);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      inflation_factor: 1.05,
      valuations: [],
      calculated_at: "t",
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    const [pathArg, bodyArg] = postMock.mock.calls[0] ?? [];
    expect(pathArg).toBe("/valuation/calculate");
    const engineBody = bodyArg as {
      checkpoint: string;
      schema_version: string;
      drafted_players: unknown[];
    };
    expect(engineBody.checkpoint).toBe("pre_draft");
    expect(engineBody.schema_version).toBe("1.0.0");
    expect(Array.isArray(engineBody.drafted_players)).toBe(true);
  });

  it("forwards engine HTTP status when amethyst rejects with AxiosError", async () => {
    const axiosErr = new AxiosError("Unprocessable");
    axiosErr.response = {
      status: 422,
      data: { error: "bad context" },
      statusText: "Unprocessable Entity",
      headers: {},
      config: {} as never,
    };

    postMock.mockRejectedValue(axiosErr);

    const res = await request(app)
      .post("/valuations")
      .set("x-player-api-key", "test-secret")
      .send(preDraftFixture);

    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("ENGINE_UPSTREAM_ERROR");
    expect(postMock).toHaveBeenCalled();
  });
});
