const FINGERPRINT_HEX = /^[a-f0-9]{64}$/i;

/**
 * When Engine POSTs `signals_updated` with the same SHA-256 fingerprint Draft
 * uses for Engine `GET /signals/news`, we can fan out immediately without waiting
 * for Draft's poller HTTP round-trip.
 */
export function extractEngineNewsWebhookSnapshotHint(
  body: unknown,
): { fingerprint: string; count: number } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.event !== "signals_updated") return null;
  if (typeof o.fingerprint !== "string") return null;
  const fp = o.fingerprint.trim();
  if (!FINGERPRINT_HEX.test(fp)) return null;
  let count = 0;
  if (typeof o.count === "number" && Number.isFinite(o.count) && o.count >= 0) {
    count = Math.floor(o.count);
  }
  return { fingerprint: fp, count };
}
