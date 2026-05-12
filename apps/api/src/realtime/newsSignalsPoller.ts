import type { Server } from "socket.io";
import { AxiosError } from "axios";
import { amethyst } from "../lib/amethyst";
import { extractEngineNewsWebhookSnapshotHint } from "../lib/engineNewsWebhookHint";
import {
  fingerprintNewsSignalsPayload,
  type NewsSignalsPayload,
} from "../lib/newsSignalsFingerprint";

export const NEWS_SIGNALS_UPDATED_EVENT = "news_signals_updated";

/** Match web navbar lookback — server-side poll uses the same window. */
const DEFAULT_LOOKBACK_DAYS = 7;

/** Singleton poll interval when at least one Socket.IO client is connected. */
const POLL_INTERVAL_MS = 20_000;

let ioRef: Server | null = null;
let subscriberCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastFingerprint: string | null = null;
/** Forward-compat: when Engine sends ETag, wire If-None-Match for cheap 304s. */
let lastEtag: string | undefined;

function validatePollStatus(status: number): boolean {
  return (status >= 200 && status < 300) || status === 304;
}

async function pollOnce(): Promise<void> {
  if (!ioRef) return;

  try {
    const headers: Record<string, string> = {};
    if (lastEtag) {
      headers["If-None-Match"] = lastEtag;
    }

    const axiosRes = await amethyst.get<NewsSignalsPayload>("/signals/news", {
      params: { days: String(DEFAULT_LOOKBACK_DAYS) },
      headers,
      validateStatus: validatePollStatus,
    });

    if (axiosRes.status === 304) {
      return;
    }

    const rawEtag = axiosRes.headers["etag"];
    if (typeof rawEtag === "string" && rawEtag.length > 0) {
      lastEtag = rawEtag;
    }

    const data = axiosRes.data;
    const fp = fingerprintNewsSignalsPayload(data);

    if (lastFingerprint === null) {
      lastFingerprint = fp;
      return;
    }

    if (fp !== lastFingerprint) {
      lastFingerprint = fp;
      const count =
        typeof data?.count === "number"
          ? data.count
          : Array.isArray(data?.signals)
            ? data.signals.length
            : 0;
      ioRef.emit(NEWS_SIGNALS_UPDATED_EVENT, {
        count,
        fingerprint: fp,
      });
    }
  } catch (err) {
    if (err instanceof AxiosError) {
      console.error(
        "[newsSignalsPoller] Engine GET /signals/news failed:",
        err.response?.status ?? err.message,
      );
    } else {
      console.error("[newsSignalsPoller] poll error:", err);
    }
  }
}

export function forcePollFromWebhook(): void {
  void pollOnce();
}

/**
 * Fast path: Engine includes the same snapshot fingerprint Draft computes from
 * `GET /signals/news`, so we can emit before `pollOnce` finishes (still run
 * pollOnce afterward to sync ETag / lastFingerprint with Engine).
 */
export function applyEngineNewsWebhookSnapshotHint(body: unknown): void {
  const hint = extractEngineNewsWebhookSnapshotHint(body);
  if (!hint || !ioRef) return;
  const { fingerprint: fp, count: n } = hint;

  if (lastFingerprint === null) {
    lastFingerprint = fp;
    return;
  }
  if (lastFingerprint === fp) return;

  lastFingerprint = fp;
  ioRef.emit(NEWS_SIGNALS_UPDATED_EVENT, {
    count: n,
    fingerprint: fp,
  });
}

/** Engine developer-portal test webhook (`event: "custom"`) — signals unchanged, so poll alone emits nothing. */
export function emitNewsSignalsWebhookTestPing(message?: string): void {
  if (!ioRef) return;
  ioRef.emit(NEWS_SIGNALS_UPDATED_EVENT, {
    ping: true,
    message: message?.trim() || undefined,
  });
}

function startPoller(): void {
  if (pollTimer !== null || !ioRef) return;
  void pollOnce();
  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

function stopPoller(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function initNewsSignalsPoller(io: Server): void {
  ioRef = io;
}

export function registerNewsSignalsSubscriber(): void {
  subscriberCount += 1;
  if (subscriberCount === 1) {
    startPoller();
  }
}

export function unregisterNewsSignalsSubscriber(): void {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0) {
    stopPoller();
  }
}

/** Connected sockets that bumped the poller refcount (best-effort ops metric). */
export function getNewsSignalsPollerSubscriberCount(): number {
  return subscriberCount;
}

export function isNewsSignalsPollerIntervalRunning(): boolean {
  return pollTimer !== null;
}

/** Stops the poller and clears refs (graceful shutdown / process exit). */
export function resetNewsSignalsPoller(): void {
  stopPoller();
  subscriberCount = 0;
  ioRef = null;
  lastFingerprint = null;
  lastEtag = undefined;
}
