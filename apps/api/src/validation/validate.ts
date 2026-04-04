import type { ZodTypeAny, ZodIssue } from "zod";
import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "../lib/appError";

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * On failure: 400 with { message, errors: [{ field, message }] }
 * On success: req.body is replaced with the parsed (coerced + stripped) data.
 */
export function validate(schema: ZodTypeAny) {
  return validateBody(schema);
}

function toValidationErrors(issues: ZodIssue[], source: string) {
  return issues.map((e) => ({
    field: e.path.join(".") || source,
    message: e.message,
  }));
}

function replaceRequestObject(current: unknown, nextData: Record<string, unknown>) {
  if (!current || typeof current !== "object") {
    return nextData;
  }

  const target = current as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, nextData);
  return target;
}

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError("Validation failed", 400, "VALIDATION_FAILED", toValidationErrors(result.error.issues, "body")));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError("Validation failed", 400, "VALIDATION_FAILED", toValidationErrors(result.error.issues, "query")));
      return;
    }
    replaceRequestObject(
      req.query,
      result.data as Record<string, unknown>,
    );
    next();
  };
}

export function validateParams(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new ValidationError("Validation failed", 400, "VALIDATION_FAILED", toValidationErrors(result.error.issues, "params")));
      return;
    }
    replaceRequestObject(
      req.params,
      result.data as Record<string, unknown>,
    );
    next();
  };
}
