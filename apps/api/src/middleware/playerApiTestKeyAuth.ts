import type { RequestHandler } from "express";

const HEADER = "x-player-api-key";

/**
 * Requires PLAYER_API_TEST_KEY env and matching `x-player-api-key` header
 * or `Authorization: Bearer <key>` (for Activity #9 / external graders).
 */
export const playerApiTestKeyAuth: RequestHandler = (req, res, next) => {
  const expected = process.env.PLAYER_API_TEST_KEY?.trim();
  if (!expected) {
    res.status(503).json({
      error: "PLAYER_API_TESTING_DISABLED",
      message: "PLAYER_API_TEST_KEY is not configured on this server.",
    });
    return;
  }

  const headerKey = req.get(HEADER)?.trim();
  const auth = req.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : undefined;
  const provided = headerKey || bearer;

  if (!provided || provided !== expected) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Invalid or missing player API test key.",
    });
    return;
  }

  next();
};
