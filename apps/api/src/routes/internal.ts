import type { Request } from "express";
import { Router } from "express";
import {
  emitNewsSignalsWebhookTestPing,
  forcePollFromWebhook,
} from "../realtime/newsSignalsPoller";

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

/**
 * Engine calls this when news/injury signals are ingested.
 * Auth: token must match INTERNAL_WEBHOOK_SECRET if set, else AMETHYST_API_KEY.
 * Body optional; we refetch Engine and broadcast if the snapshot changed.
 */
router.post("/news-signals/hook", (req, res): void => {
  const secret = resolveNewsSignalsWebhookBearerSecret();
  if (!secret) {
    res.status(503).json({
      error:
        "Webhook not configured: set AMETHYST_API_KEY or INTERNAL_WEBHOOK_SECRET",
    });
    return;
  }

  const token = extractIncomingWebhookToken(req);
  if (token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  forcePollFromWebhook();

  const body = req.body as { event?: string; message?: string } | undefined;
  if (body?.event === "custom") {
    emitNewsSignalsWebhookTestPing(body.message);
  }

  res.status(204).send();
});

export default router;
