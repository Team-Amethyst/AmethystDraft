import type { CorsOptions } from "cors";

/**
 * Builds CORS `origin` option from `CORS_ORIGIN`.
 *
 * - Comma-separated list, e.g. `https://draftroom.uk,https://www.draftroom.uk,http://localhost:5173`
 * - Trailing slashes are stripped (browser `Origin` never includes a path).
 * - Requests with no `Origin` (same-origin, curl, health checks) are allowed.
 * - With `credentials: true`, only listed origins receive `Access-Control-Allow-Credentials`.
 */
export function corsOptionsFromEnv(): Pick<CorsOptions, "origin" | "credentials"> {
  const raw = process.env.CORS_ORIGIN?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const list = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["http://localhost:5173"];

  const allowed = new Set(list.map((o) => o.replace(/\/$/, "")));
  const localDevOriginRe =
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i;

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = origin.replace(/\/$/, "");
      const localDevAllowed = !isProduction && localDevOriginRe.test(normalized);
      const allow = allowed.has(normalized) || localDevAllowed;
      callback(null, allow);
    },
  };
}
