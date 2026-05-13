import type { ConnectOptions } from "mongoose";

/**
 * Pool sizing for Atlas / MongoDB.
 *
 * The MongoDB Node **driver default** for `maxPoolSize` is **100** per process when
 * omitted. Each API replica / App Runner task / local `nodemon` process multiplies
 * whatever cap you set, so total cluster connections ≈
 * `(processes × maxPoolSize)` in the worst case, plus other clients (CI, scripts,
 * Atlas UI, staging).
 *
 * Draftroom sets a **conservative default** (10) and caps via `MONGODB_MAX_POOL_SIZE`
 * (integer 1–500). Tune per environment (e.g. `5` on tiny Atlas tiers with many tasks).
 *
 * Timeouts: `serverSelectionTimeoutMS` is set explicitly (30000 ms). `socketTimeoutMS`
 * is left unset (Node driver default, typically `0` = no idle socket timeout).
 */
export function mongoConnectionOptionsFromEnv(): ConnectOptions {
  const raw = process.env.MONGODB_MAX_POOL_SIZE?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const maxPoolSize =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= 500
      ? Math.floor(parsed)
      : 10;

  return {
    maxPoolSize,
    minPoolSize: 0,
    /** Fewer sockets opened at once during pool warm-up (driver default is 2; explicit for clarity). */
    maxConnecting: 2,
    /**
     * Return idle sockets to the pool / close them so Atlas does not accumulate
     * long-lived connections from bursty traffic.
     */
    maxIdleTimeMS: 60_000,
    /** Explicit driver default band so ops logs match Atlas/driver expectations. */
    serverSelectionTimeoutMS: 30_000,
  };
}
