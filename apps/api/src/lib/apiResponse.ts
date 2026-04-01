import type { Response } from "express";

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export function sendError(
  res: Response,
  status: number,
  payload: ApiErrorPayload,
): void {
  // Keep top-level message for backward compatibility with existing clients.
  res.status(status).json({
    message: payload.message,
    error: payload,
  });
}
