import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import errorHandler from "./errorHandler";
import { UpstreamError } from "../lib/appError";

describe("errorHandler", () => {
  it("forwards Engine 400 Zod shape without AppError wrapper", async () => {
    const app = express();
    app.get("/boom", (_req, _res, next) => {
      next(
        new UpstreamError("Engine request failed", 400, "ENGINE_UPSTREAM_ERROR", {
          errors: [{ field: "drafted_players.0.position", message: "Required" }],
        }),
      );
    });
    app.use(errorHandler);

    const res = await request(app).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: [{ field: "drafted_players.0.position", message: "Required" }],
    });
    expect(res.body.message).toBeUndefined();
  });

  it("still wraps normal AppError responses", async () => {
    const app = express();
    app.get("/nf", (_req, _res, next) => {
      next(new UpstreamError("x", 404, "ENGINE_UPSTREAM_ERROR", { foo: 1 }));
    });
    app.use(errorHandler);

    const res = await request(app).get("/nf");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("x");
    expect(res.body.error?.code).toBe("ENGINE_UPSTREAM_ERROR");
  });
});
