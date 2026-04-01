import type { ZodTypeAny, ZodIssue } from "zod";
import type { Request, Response, NextFunction } from "express";
import { sendError } from "../lib/apiResponse";

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

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 400, {
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details: toValidationErrors(result.error.issues, "body"),
      });
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
      sendError(res, 400, {
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details: toValidationErrors(result.error.issues, "query"),
      });
      return;
    }
    req.query = result.data as Request["query"];
    next();
  };
}

export function validateParams(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      sendError(res, 400, {
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details: toValidationErrors(result.error.issues, "params"),
      });
      return;
    }
    req.params = result.data as Request["params"];
    next();
  };
}
