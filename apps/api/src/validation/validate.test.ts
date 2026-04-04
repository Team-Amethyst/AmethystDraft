import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { validateQuery } from "./validate";
import { ValidationError } from "../lib/appError";

describe("validateQuery", () => {
  it("mutates the existing req.query object with coerced values", () => {
    const queryState: Record<string, unknown> = { days: "7", extra: "drop-me" };
    const req = {} as Request;
    Object.defineProperty(req, "query", {
      configurable: true,
      get: () => queryState,
      set: () => {
        // Mimic Express getter-backed behavior where direct reassignment is unreliable.
      },
    });

    const res = {} as Response;
    const next: NextFunction = vi.fn();
    const middleware = validateQuery(
      z.object({ days: z.coerce.number().int().min(1).max(30) }),
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(queryState).toEqual({ days: 7 });
  });

  it("calls next with a ValidationError on schema failure", () => {
    const req = { query: { days: "999" } } as unknown as Request;
    const res = {} as Response;
    const next: NextFunction = vi.fn();
    const middleware = validateQuery(
      z.object({ days: z.coerce.number().int().min(1).max(30) }),
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = vi.mocked(next).mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(ValidationError);
    const appErr = err as unknown as ValidationError;
    expect(appErr.statusCode).toBe(400);
    expect(appErr.code).toBe("VALIDATION_FAILED");
  });
});
