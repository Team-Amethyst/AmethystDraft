/**
 * Minimal Draftroom API for Playwright E2E (no MongoDB).
 * Load real Socket.IO + internal webhook route + JWT auth stubs via DRAFTROOM_E2E_STUB=1.
 *
 * Run: `pnpm exec tsx e2e/stub-api.ts` from apps/web (after deps install).
 */
import express from "express";
import http from "node:http";
import cors from "cors";

/** Minimal listener so the news poller’s Engine GET does not spam ECONNREFUSED logs. */
function startMockEngine(port: number): http.Server {
  const mock = http.createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        etag: '"e2e-stub"',
      });
      res.end(JSON.stringify({ signals: [], count: 0 }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  mock.listen(port, "127.0.0.1");
  return mock;
}
import {
  E2E_STUB_PORT,
  E2E_PREVIEW_ORIGIN,
  E2E_JWT_SECRET,
  E2E_INTERNAL_API_KEY,
} from "./constants.ts";

async function main(): Promise<void> {
  const MOCK_ENGINE_PORT = 3098;
  process.env.DRAFTROOM_E2E_STUB = "1";
  process.env.JWT_SECRET = E2E_JWT_SECRET;
  process.env.AMETHYST_API_KEY = E2E_INTERNAL_API_KEY;
  process.env.CORS_ORIGIN = E2E_PREVIEW_ORIGIN;
  process.env.AMETHYST_API_BASE_URL = `http://127.0.0.1:${MOCK_ENGINE_PORT}`;
  process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

  startMockEngine(MOCK_ENGINE_PORT);

  const [{ default: authMiddleware }, { attachSocketServer }, { default: internalRouter }] =
    await Promise.all([
      import("../../api/src/middleware/auth.ts"),
      import("../../api/src/realtime/socketServer.ts"),
      import("../../api/src/routes/internal.ts"),
    ]);

  const app = express();
  app.use(
    cors({
      origin: [E2E_PREVIEW_ORIGIN, "http://localhost:4173"],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "Draftroom API is running" });
  });

  app.get(
    "/api/engine/signals/news",
    authMiddleware as unknown as express.RequestHandler,
    (_req, res) => {
      res.json({ signals: [], count: 0 });
    },
  );

  app.use("/api/internal", internalRouter);

  const server = http.createServer(app);
  attachSocketServer(server);

  await new Promise<void>((resolve, reject) => {
    server.listen(E2E_STUB_PORT, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  console.log(
    `[e2e stub] listening on http://127.0.0.1:${E2E_STUB_PORT} (preview origin ${E2E_PREVIEW_ORIGIN})`,
  );
}

main().catch((err) => {
  console.error("[e2e stub] failed:", err);
  process.exit(1);
});
