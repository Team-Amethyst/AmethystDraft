import { createHash } from "node:crypto";

/** Payload shape from Engine `GET /signals/news` (BFF proxy uses the same). */
export interface NewsSignalsPayload {
  signals?: unknown[];
  count?: number;
}

/**
 * Stable fingerprint for change detection. Sorts serialized rows so order-in-array
 * does not cause false positives.
 */
export function fingerprintNewsSignalsPayload(data: unknown): string {
  const payload = data as NewsSignalsPayload;
  const signals = Array.isArray(payload?.signals) ? payload.signals : [];
  const normalized = signals.map((s) => JSON.stringify(s)).sort().join("\n");
  const count =
    typeof payload?.count === "number" ? payload.count : signals.length;
  return createHash("sha256").update(`${count}\n${normalized}`).digest("hex");
}
