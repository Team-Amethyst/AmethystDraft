import { Router } from "express";
import { forcePollFromWebhook } from "../realtime/newsSignalsPoller";

const router: Router = Router();

/** Prefer dedicated secret; otherwise reuse Engine API key (same Bearer Engine can send). */
function resolveNewsSignalsWebhookBearerSecret(): string | undefined {
  const explicit = process.env.INTERNAL_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  return process.env.AMETHYST_API_KEY?.trim();
}

/**
 * Engine calls this when news/injury signals are ingested.
 * Auth: Bearer token must match INTERNAL_WEBHOOK_SECRET if set, else AMETHYST_API_KEY.
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

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  forcePollFromWebhook();
  res.status(204).send();
});

export default router;
