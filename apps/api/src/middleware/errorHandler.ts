import { ErrorRequestHandler } from "express";
import { AppError, InternalServerError } from "../lib/appError";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    let appError: AppError;

    if (err instanceof AppError) {
        appError = err;
    } else {
        if (err instanceof Error) {
            console.error(err.stack || err.message);
        } else {
            console.error(err);
        }
        appError = new InternalServerError();
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