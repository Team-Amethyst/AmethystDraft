/**
 * Boots HTTP + Socket.IO + internal webhook route without MongoDB or production Engine.
 * Verifies the Engine portal "test" ping reaches a browser-grade socket.io-client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { io as ioClient, type Socket as IoSocket } from "socket.io-client";

import internalRouter from "../routes/internal";
import { __resetNewsSignalsWebhookIngressForTests } from "../lib/newsSignalsWebhookIngress";
import { amethyst } from "../lib/amethyst";
import { attachSocketServer } from "./socketServer";
import { NEWS_SIGNALS_UPDATED_EVENT } from "./newsSignalsPoller";
import User from "../models/User";

const USER_ID = "507f1f77bcf86cd799439011";
const JWT_SECRET = "integration-test-jwt-secret-do-not-use-prod";
const API_KEY = "integration-test-amethyst-api-key";

vi.mock("../models/User", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../lib/amethyst", () => ({
  amethyst: {
    get: vi.fn(),
  },
}));

describe("news signals socket + webhook (integration)", () => {
  let server: http.Server;
  let baseUrl: string;
  let clientSocket: IoSocket | undefined;

  beforeEach(() => {
    __resetNewsSignalsWebhookIngressForTests();
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.AMETHYST_API_KEY = API_KEY;
    delete process.env.INTERNAL_WEBHOOK_SECRET;
    process.env.AMETHYST_API_BASE_URL = "https://engine-mock.example";

    vi.mocked(amethyst.get).mockReset();
    vi.mocked(amethyst.get).mockResolvedValue({
      status: 200,
      headers: { etag: '"integration-mock-etag"' },
      data: { signals: [], count: 0 },
    });

    vi.mocked(User.findById).mockImplementation(
      () =>
        ({
          select: vi.fn().mockResolvedValue({
            _id: new mongoose.Types.ObjectId(USER_ID),
            id: USER_ID,
          }),
        }) as ReturnType<typeof User.findById>,
    );
  });

  afterEach(() => {
    clientSocket?.removeAllListeners();
    clientSocket?.close();
    clientSocket = undefined;
    server?.close();
    vi.clearAllMocks();
  });

  it("delivers portal test ping over Socket.IO after POST /news-signals/hook", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/internal", internalRouter);

    server = http.createServer(app);
    attachSocketServer(server);

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);

    clientSocket = ioClient(baseUrl, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket"],
      autoConnect: true,
    });

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error("socket connect timeout")),
        8000,
      );
      clientSocket!.once("connect", () => {
        clearTimeout(to);
        resolve();
      });
      clientSocket!.once("connect_error", (err: Error) => {
        clearTimeout(to);
        reject(err);
      });
    });

    const pingPromise = new Promise<unknown>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("no ping event")), 8000);
      clientSocket!.once(NEWS_SIGNALS_UPDATED_EVENT, (payload: unknown) => {
        clearTimeout(to);
        resolve(payload);
      });
    });

    const res = await fetch(`${baseUrl}/api/internal/news-signals/hook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "custom",
        message: "integration ping",
      }),
    });

    expect(res.status).toBe(204);

    await expect(pingPromise).resolves.toMatchObject({
      ping: true,
      message: "integration ping",
    });
  });

  it("emits news_signals_updated when hook forces a poll and Engine payload fingerprint changes", async () => {
    let pollCall = 0;
    vi.mocked(amethyst.get).mockImplementation(async () => {
      pollCall += 1;
      if (pollCall === 1) {
        return {
          status: 200,
          headers: {},
          data: { signals: [], count: 0 },
        };
      }
      return {
        status: 200,
        headers: {},
        data: {
          count: 1,
          signals: [
            {
              player_name: "Integration Player",
              signal_type: "injury",
              effective_date: "2026-05-01",
              description: "test",
              source: "integration",
            },
          ],
        },
      };
    });

    const app = express();
    app.use(express.json());
    app.use("/api/internal", internalRouter);

    server = http.createServer(app);
    attachSocketServer(server);

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);

    clientSocket = ioClient(baseUrl, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket"],
      autoConnect: true,
    });

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error("socket connect timeout")),
        8000,
      );
      clientSocket!.once("connect", () => {
        clearTimeout(to);
        resolve();
      });
      clientSocket!.once("connect_error", (err: Error) => {
        clearTimeout(to);
        reject(err);
      });
    });

    await expect.poll(() => pollCall).toBe(1);

    const updatePromise = new Promise<unknown>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error("no news_signals_updated event")),
        8000,
      );
      clientSocket!.once(NEWS_SIGNALS_UPDATED_EVENT, (payload: unknown) => {
        clearTimeout(to);
        resolve(payload);
      });
    });

    const res = await fetch(`${baseUrl}/api/internal/news-signals/hook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "signals_updated" }),
    });

    expect(res.status).toBe(204);

    await expect(updatePromise).resolves.toMatchObject({
      count: 1,
      fingerprint: expect.any(String),
    });
    expect(pollCall).toBe(2);
  });
});
