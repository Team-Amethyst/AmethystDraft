import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import internalRouter from "./internal";
import errorHandler from "../middleware/errorHandler";
import { __resetNewsSignalsWebhookIngressForTests } from "../lib/newsSignalsWebhookIngress";

const forcePollMock = vi.fn();
const pingMock = vi.fn();
const snapshotHintMock = vi.fn();

vi.mock("../realtime/socketServer", () => ({
  getSocketIoConnectionsCount: () => 7,
}));

vi.mock("../realtime/newsSignalsPoller", () => ({
  applyEngineNewsWebhookSnapshotHint: (...a: unknown[]) =>
    snapshotHintMock(...a),
  forcePollFromWebhook: (...a: unknown[]) => forcePollMock(...a),
  emitNewsSignalsWebhookTestPing: (...a: unknown[]) => pingMock(...a),
  getNewsSignalsPollerSubscriberCount: () => 4,
  isNewsSignalsPollerIntervalRunning: () => true,
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/internal", internalRouter);
  app.use(errorHandler);
  return app;
}

describe("internal news-signals routes", () => {
  const app = makeApp();
  const prevKey = process.env.AMETHYST_API_KEY;
  const prevInternal = process.env.INTERNAL_WEBHOOK_SECRET;

  beforeEach(() => {
    __resetNewsSignalsWebhookIngressForTests();
    forcePollMock.mockClear();
    pingMock.mockClear();
    snapshotHintMock.mockClear();
    process.env.AMETHYST_API_KEY = "test-webhook-key";
    delete process.env.INTERNAL_WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env.AMETHYST_API_KEY = prevKey;
    process.env.INTERNAL_WEBHOOK_SECRET = prevInternal;
  });

  it("GET /news-signals/debug returns 401 without auth", async () => {
    await request(app).get("/api/internal/news-signals/debug").expect(401);
  });

  it("GET /news-signals/debug returns JSON with Bearer", async () => {
    const res = await request(app)
      .get("/api/internal/news-signals/debug")
      .set("Authorization", "Bearer test-webhook-key")
      .expect(200);
    expect(res.body.socketIoConnections).toBe(7);
    expect(res.body.newsSignalsPollerRefcount).toBe(4);
    expect(res.body.pollerIntervalActive).toBe(true);
    expect(res.body.redisUrlConfigured).toBe(false);
    expect(res.body.requestRouteMetrics).toMatchObject({
      startedAtMs: expect.any(Number),
      buckets: expect.any(Object),
    });
    expect(res.body.newsSignalsWebhook).toMatchObject({
      totalHookCalls: expect.any(Number),
      dedupeSkipped: expect.any(Number),
      pollThrottled: expect.any(Number),
      forcePollInvoked: expect.any(Number),
      callsLast60s: expect.any(Number),
    });
  });

  it("POST /news-signals/hook returns 204 and pings on event=custom", async () => {
    const res = await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send({ event: "custom", message: "portal test" })
      .expect(204);
    expect(res.headers["x-draftroom-webhook-decision"]).toBe("full");
    expect(res.headers["x-draftroom-socket-connections"]).toBe("7");
    expect(snapshotHintMock).toHaveBeenCalledTimes(1);
    expect(forcePollMock).toHaveBeenCalledTimes(1);
    expect(pingMock).toHaveBeenCalledWith("portal test");
  });

  it("POST hook does not ping on signals_updated", async () => {
    await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send({ event: "signals_updated", occurred_at: "2026-01-01T00:00:00Z" })
      .expect(204);
    expect(pingMock).not.toHaveBeenCalled();
    expect(snapshotHintMock).toHaveBeenCalledTimes(1);
  });

  it("POST hook forwards body to snapshot hint before force poll", async () => {
    const fp = "b".repeat(64);
    await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send({ event: "signals_updated", fingerprint: fp, count: 3 })
      .expect(204);
    expect(snapshotHintMock).toHaveBeenCalledWith({
      event: "signals_updated",
      fingerprint: fp,
      count: 3,
    });
    expect(forcePollMock).toHaveBeenCalledTimes(1);
  });

  it("POST hook dedupes identical payload within TTL (no second poll or hint)", async () => {
    const payload = { event: "signals_updated", occurred_at: "2026-01-01T00:00:00Z" };
    await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send(payload)
      .expect(204)
      .expect("X-Draftroom-Webhook-Decision", "full");
    await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send(payload)
      .expect(204)
      .expect("X-Draftroom-Webhook-Decision", "dedupe_body");
    expect(snapshotHintMock).toHaveBeenCalledTimes(1);
    expect(forcePollMock).toHaveBeenCalledTimes(1);
  });

  it("POST hook throttles force poll for distinct payloads within spacing window", async () => {
    await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send({ event: "signals_updated", n: 1 })
      .expect(204)
      .expect("X-Draftroom-Webhook-Decision", "full");
    await request(app)
      .post("/api/internal/news-signals/hook")
      .set("Authorization", "Bearer test-webhook-key")
      .send({ event: "signals_updated", n: 2 })
      .expect(204)
      .expect("X-Draftroom-Webhook-Decision", "throttle_poll_only");
    expect(forcePollMock).toHaveBeenCalledTimes(1);
    expect(snapshotHintMock).toHaveBeenCalledTimes(2);
  });
});
