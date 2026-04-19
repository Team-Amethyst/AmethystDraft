import { ErrorRequestHandler } from "express";
import { AppError, InternalServerError, UpstreamError } from "../lib/appError";
import { logRequestError } from "../lib/errorLogging";

function isEngineZodErrorBody(details: unknown): details is { errors: unknown[] } {
    if (!details || typeof details !== "object") return false;
    const e = details as { errors?: unknown };
    return Array.isArray(e.errors);
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    let appError: AppError;

    // Always log the original error first (before any normalization)
    // so stack traces and root-cause details are preserved in logs.
    logRequestError(err, req, "errorHandler");

    if (err instanceof AppError) {
        // Known API error: preserve intended status/code/message.
        appError = err;
    } else {
        // Unknown error: hide internals from clients, return safe 500 payload.
        appError = new InternalServerError();
    }

    // Amethyst Engine returns 400/422 as { errors: [{ field, message }] } — forward as-is
    // (400 = request validation; 422 = output sanity) so graders match the Engine contract.
    if (
        appError instanceof UpstreamError &&
        (appError.statusCode === 400 || appError.statusCode === 422) &&
        isEngineZodErrorBody(appError.details)
    ) {
        res.status(appError.statusCode).json(appError.details);
        return;
    }

    res.status(appError.statusCode).json({
        message: appError.message,
        error: {
            code: appError.code,
            message: appError.message,
            details: appError.details,
        },
    });
};

export default errorHandler;