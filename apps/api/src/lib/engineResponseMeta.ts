import type { AxiosResponse } from "axios";
import type { Response } from "express";

/** Propagate Engine correlation headers to the Draft API client (browser / grader). */
export function forwardEngineCorrelationHeaders(
  res: Response,
  axiosRes: AxiosResponse,
): void {
  const rid = axiosRes.headers["x-request-id"];
  if (rid) {
    res.setHeader("X-Request-Id", String(rid));
  }
}
