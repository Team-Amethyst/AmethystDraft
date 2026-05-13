import { createHash } from "node:crypto";
import type { Request } from "express";

/** Identical JSON body within this window is ignored entirely (no Engine poll, no Socket.IO). */
const BODY_DEDUPE_TTL_MS = 15_000;

/** Minimum spacing between Engine `GET /signals/news` triggers from webhooks (per process). */
const MIN_FORCE_POLL_SPACING_MS = 2_500;

const bodyDedupeExpiry = new Map<string, number>();

/** Monotonic timestamps of hook POSTs (after auth) for rolling 60s rate. */
const hookCallTimestamps: number[] = [];

let lastForcePollAtMs = 0;

export type NewsSignalsWebhookIngressDecision =
  | "dedupe_body"
  | "throttle_poll_only"
  | "full";

export type NewsSignalsWebhookIngressCounters = {
  totalHookCalls: number;
  dedupeSkipped: number;
  pollThrottled: number;
  forcePollInvoked: number;
  callsLast60s: number;
};

const counters = {
  totalHookCalls: 0,
  dedupeSkipped: 0,
  pollThrottled: 0,
  forcePollInvoked: 0,
};

function pruneBodyDedupe(now: number): void {
  for (const [hash, exp] of bodyDedupeExpiry) {
    if (exp <= now) bodyDedupeExpiry.delete(hash);
  }
}

function pruneCallWindow(now: number): void {
  const cutoff = now - 60_000;
  while (hookCallTimestamps.length > 0) {
    const first = hookCallTimestamps[0];
    if (first === undefined || first >= cutoff) break;
    hookCallTimestamps.shift();
  }
}

function recordHookReceived(): void {
  const now = Date.now();
  counters.totalHookCalls += 1;
  hookCallTimestamps.push(now);
  pruneCallWindow(now);
}

export function stableJsonForWebhookFingerprint(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => canonicalizeJson(v));
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = canonicalizeJson(o[k]);
  }
  return out;
}

export function webhookPayloadFingerprint(body: unknown): string {
  return createHash("sha256")
    .update(stableJsonForWebhookFingerprint(body), "utf8")
    .digest("hex");
}

export function decideNewsSignalsWebhookIngress(
  body: unknown,
): NewsSignalsWebhookIngressDecision {
  const now = Date.now();
  pruneBodyDedupe(now);

  const hash = webhookPayloadFingerprint(body);
  const existing = bodyDedupeExpiry.get(hash);
  if (existing !== undefined && existing > now) {
    counters.dedupeSkipped += 1;
    return "dedupe_body";
  }

  bodyDedupeExpiry.set(hash, now + BODY_DEDUPE_TTL_MS);

  const sincePoll = now - lastForcePollAtMs;
  if (lastForcePollAtMs > 0 && sincePoll < MIN_FORCE_POLL_SPACING_MS) {
    counters.pollThrottled += 1;
    return "throttle_poll_only";
  }

  lastForcePollAtMs = now;
  counters.forcePollInvoked += 1;
  return "full";
}

export function recordNewsSignalsHookReceived(): void {
  recordHookReceived();
}

export function getNewsSignalsWebhookIngressCounters(): NewsSignalsWebhookIngressCounters {
  const now = Date.now();
  pruneCallWindow(now);
  return {
    totalHookCalls: counters.totalHookCalls,
    dedupeSkipped: counters.dedupeSkipped,
    pollThrottled: counters.pollThrottled,
    forcePollInvoked: counters.forcePollInvoked,
    callsLast60s: hookCallTimestamps.length,
  };
}

export function logNewsSignalsWebhookIngress(
  req: Request,
  decision: NewsSignalsWebhookIngressDecision,
  body: unknown,
): void {
  const o =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const event = typeof o.event === "string" ? o.event : "";
  const source =
    (typeof o.source === "string" && o.source) ||
    (typeof req.headers["x-webhook-source"] === "string" &&
      req.headers["x-webhook-source"]) ||
    "";
  const ephemeral =
    o.ephemeral === true ||
    (typeof o.ephemeral === "string" && o.ephemeral === "true");
  const uaRaw = req.get("user-agent") ?? "";
  const ua =
    uaRaw.length > 120 ? `${uaRaw.slice(0, 117)}...` : uaRaw;
  const fp = webhookPayloadFingerprint(body);
  const fpShort = `${fp.slice(0, 12)}…${fp.slice(-8)}`;

  const line = {
    scope: "newsSignalsWebhook",
    decision,
    method: req.method,
    event,
    source: source || undefined,
    ephemeral: ephemeral || undefined,
    payloadFingerprint: fpShort,
    userAgent: ua || undefined,
  };

  if (decision === "dedupe_body" || decision === "throttle_poll_only") {
    console.warn("[newsSignalsWebhook]", line);
  } else if (process.env.DRAFTROOM_WEBHOOK_VERBOSE_LOG === "1") {
    console.info("[newsSignalsWebhook]", line);
  }
}

export function __resetNewsSignalsWebhookIngressForTests(): void {
  bodyDedupeExpiry.clear();
  hookCallTimestamps.length = 0;
  lastForcePollAtMs = 0;
  counters.totalHookCalls = 0;
  counters.dedupeSkipped = 0;
  counters.pollThrottled = 0;
  counters.forcePollInvoked = 0;
}
