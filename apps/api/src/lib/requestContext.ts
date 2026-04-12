import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type Locals = { requestId?: string };

const store = new AsyncLocalStorage<{ requestId: string }>();

/**
 * Express-compatible request correlation (matches Engine: honor X-Request-Id or generate).
 * Uses res.locals for handlers/logging and AsyncLocalStorage so the shared axios client
 * can attach the same id to outbound Engine calls without per-call plumbing.
 */
export function assignRequestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.get("x-request-id")?.trim();
  const id =
    incoming && incoming.length > 0 && incoming.length <= 256
      ? incoming
      : randomUUID();
  res.setHeader("X-Request-Id", id);
  (res.locals as Locals).requestId = id;
  store.run({ requestId: id }, () => next());
}

export function getRequestId(res: Response): string | undefined {
  return (res.locals as Locals).requestId;
}

export function getRequestIdFromStore(): string | undefined {
  return store.getStore()?.requestId;
}
