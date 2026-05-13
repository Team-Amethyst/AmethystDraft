import { getRequestRouteMetricsSnapshot } from "../middleware/requestRouteMetrics";
import { Router } from "express";
import {
  applyEngineNewsWebhookSnapshotHint,
  emitNewsSignalsWebhookTestPing,
  forcePollFromWebhook,
  getNewsSignalsPollerSubscriberCount,
  isNewsSignalsPollerIntervalRunning,
} from "../realtime/newsSignalsPoller";
import { getSocketIoConnectionsCount } from "../realtime/socketServer";

const router: Router = Router();

/** Prefer dedicated secret; otherwise reuse Engine API key (same Bearer Engine can send). */
function resolveNewsSignalsWebhookBearerSecret(): string | undefined {
  const explicit = process.env.INTERNAL_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  return process.env.AMETHYST_API_KEY?.trim();
}

/**
 * Accepts `Authorization: Bearer <token>` (case-insensitive scheme, trim) or `x-api-key: <token>`
 * for server-to-server calls that prefer the same header style as Engine HTTP.
 */
function extractIncomingWebhookToken(req: Request): string | undefined {
  const raw = req.headers.authorization;
  if (typeof raw === "string" && raw.length > 0) {
    const m = raw.match(/^\s*Bearer\s+(.+?)\s*$/i);
    if (m?.[1]) return m[1].trim();
  }
  const xk = req.headers["x-api-key"];
  if (typeof xk === "string" && xk.length > 0) {
    return xk.trim();
  }
  return undefined;
}

function assertWebhookAuth(req: Request, res: Response): boolean {
  const secret = resolveNewsSignalsWebhookBearerSecret();
  if (!secret) {
    res.status(503).json({
      error:
        "Webhook not configured: set AMETHYST_API_KEY or INTERNAL_WEBHOOK_SECRET",
    });
    return false;
  }
  const token = extractIncomingWebhookToken(req);
  if (token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * Ops / curl: same Bearer as POST webhook. Shows whether any browsers have Socket.IO connected.
 */
router.get("/news-signals/debug", (req, res): void => {
  if (!assertWebhookAuth(req, res)) return;
  res.json({
    socketIoConnections: getSocketIoConnectionsCount(),
    newsSignalsPollerRefcount: getNewsSignalsPollerSubscriberCount(),
    pollerIntervalActive: isNewsSignalsPollerIntervalRunning(),
    redisUrlConfigured: Boolean(process.env.REDIS_URL?.trim()),
    postWebhookPath: "/api/internal/news-signals/hook",
    socketIoPath: "/socket.io",
    requestRouteMetrics: getRequestRouteMetricsSnapshot(),
    hint:
      "Open the SPA signed in (any page with the bell); socketIoConnections should be >= 1 before webhook tests show in-app toasts.",
  });
});

/**
 * Engine calls this when news/injury signals are ingested.
 * Auth: token must match INTERNAL_WEBHOOK_SECRET if set, else AMETHYST_API_KEY.
 * Body optional; we refetch Engine and broadcast if the snapshot changed.
 */
router.post("/news-signals/hook", (req, res): void => {
  if (!assertWebhookAuth(req, res)) return;

  const body = req.body as { event?: string; message?: string } | undefined;
  applyEngineNewsWebhookSnapshotHint(req.body);
  forcePollFromWebhook();

  if (body?.event === "custom") {
    emitNewsSignalsWebhookTestPing(body.message);
  }

  // Lets webhook callers see how many browser sockets are connected (0 => no in-app toast).
  res.setHeader(
    "X-Draftroom-Socket-Connections",
    String(getSocketIoConnectionsCount()),
  );
  res.status(204).send();
});

export default router;
