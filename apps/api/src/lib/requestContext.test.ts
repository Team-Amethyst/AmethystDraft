import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { assignRequestId, getRequestIdFromStore } from "./requestContext";

describe("assignRequestId", () => {
  it("generates X-Request-Id when missing and exposes it in AsyncLocalStorage", async () => {
    const app = express();
    let seen: string | undefined;
    app.use(assignRequestId);
    app.get("/t", (_req, res) => {
      seen = getRequestIdFromStore();
      res.json({ ok: true });
    });

    const res = await request(app).get("/t");
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(seen).toBe(res.headers["x-request-id"]);
  });

  it("honors incoming X-Request-Id", async () => {
    const app = express();
    app.use(assignRequestId);
    app.get("/t", (_req, res) => {
      res.json({ id: getRequestIdFromStore() });
    });

    const res = await request(app)
      .get("/t")
      .set("X-Request-Id", "client-trace-99");

    expect(res.headers["x-request-id"]).toBe("client-trace-99");
    expect(res.body.id).toBe("client-trace-99");
  });

  it("rejects overlong incoming id and generates a new one", async () => {
    const app = express();
    app.use(assignRequestId);
    app.get("/t", (_req, res) => {
      res.json({ id: getRequestIdFromStore() });
    });

    const long = "x".repeat(300);
    const res = await request(app).get("/t").set("X-Request-Id", long);

    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"]).not.toBe(long);
  });
});
