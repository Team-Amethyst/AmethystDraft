import type { ConnectOptions } from "mongoose";

/**
 * Pool sizing for Atlas / MongoDB. Mongoose (via the Node driver) defaults
 * `maxPoolSize` to 100 per Node process; each replica/instance multiplies that,
 * which commonly triggers “connections exceeded” alerts on shared Atlas tiers.
 *
 * Set `MONGODB_MAX_POOL_SIZE` (integer 1–500) to tune per environment.
 */
export function mongoConnectionOptionsFromEnv(): ConnectOptions {
  const raw = process.env.MONGODB_MAX_POOL_SIZE?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const maxPoolSize =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= 500
      ? Math.floor(parsed)
      : 25;

  return {
    maxPoolSize,
    minPoolSize: 0,
  };
}
