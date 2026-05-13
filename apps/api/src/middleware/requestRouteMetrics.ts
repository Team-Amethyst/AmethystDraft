import type { Request, Response, NextFunction } from "express";

const counts = new Map<string, number>();
let startedAt = Date.now();

/**
 * Buckets HTTP paths for App Runner / ops dashboards (no query string).
 * Socket.IO requests that hit the same Node HTTP server are grouped under `/socket.io/*`.
 */
export function bucketHttpPath(rawPath: string): string {
  const path = (rawPath.split("?")[0] || "/").trim() || "/";

  if (path === "/") return "/";
  if (path === "/api/health") return "/api/health";
  if (path.startsWith("/socket.io")) return "/socket.io/*";

  if (path.startsWith("/api/auth")) return "/api/auth/*";
  if (path.startsWith("/api/players/custom")) return "/api/players/custom/*";
  if (path === "/api/players" || path.startsWith("/api/players/"))
    return "/api/players";

  if (
    /\/api\/engine\/leagues\/[^/]+\/valuation\/player\/?$/.test(path)
  ) {
    return "/api/engine/leagues/:leagueId/valuation/player";
  }
  if (/\/api\/engine\/leagues\/[^/]+\/valuation\/?$/.test(path)) {
    return "/api/engine/leagues/:leagueId/valuation";
  }
  if (path === "/api/engine/signals/news" || path.startsWith("/api/engine/signals/news")) {
    return "/api/engine/signals/news";
  }
  if (path.startsWith("/api/engine/")) return "/api/engine/*";

  if (path.startsWith("/api/leagues")) return "/api/leagues/*";

  if (path === "/api/internal/news-signals/hook") {
    return "/api/internal/news-signals/hook";
  }
  if (path === "/api/internal/news-signals/debug") {
    return "/api/internal/news-signals/debug";
  }
  if (path.startsWith("/api/internal")) return "/api/internal/*";

  return "other";
}

export function getRequestRouteMetricsSnapshot(): {
  startedAtMs: number;
  buckets: Record<string, number>;
} {
  const buckets: Record<string, number> = {};
  for (const [k, v] of counts) {
    buckets[k] = v;
  }
  return { startedAtMs: startedAt, buckets };
}

export function resetRequestRouteMetricsForTests(): void {
  counts.clear();
  startedAt = Date.now();
}

function bump(bucket: string): void {
  counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
}

/**
 * Counts completed HTTP responses by normalized path. Mount early (after body parsers).
 * Enable `DRAFTROOM_HTTP_ACCESS_LOG=1` for one line per request in addition to counters.
 */
export function requestRouteMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const pathForBucket = req.originalUrl || req.url || "/";
  res.on("finish", () => {
    const bucket = bucketHttpPath(pathForBucket);
    bump(bucket);
    if (process.env.DRAFTROOM_HTTP_ACCESS_LOG === "1") {
      const line = `[http] ${res.statusCode} ${req.method} ${bucket} ${pathForBucket}`;
      if (res.statusCode >= 500) {
        console.error(line);
      } else {
        console.log(line);
      }
    }
  });
  next();
}
