import type { ZodTypeAny, ZodIssue } from "zod";
import type { Request, Response, NextFunction } from "express";

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * On failure: 400 with { message, errors: [{ field, message }] }
 * On success: req.body is replaced with the parsed (coerced + stripped) data.
 */
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((e: ZodIssue) => ({
          field: e.path.join(".") || "body",
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
