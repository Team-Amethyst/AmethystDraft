import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User, { IUser } from "../models/User";
import { UnauthorizedError, InternalServerError } from "../lib/appError";

export interface AuthRequest extends Request {
  user?: IUser;
}

const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided", 401, "NO_TOKEN");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw new UnauthorizedError("No token provided", 401, "NO_TOKEN");
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new InternalServerError("Server misconfiguration: missing JWT secret", 500, "JWT_SECRET_MISSING");
    }

    const decoded = (
      jwt.verify as (token: string, secret: string) => JwtPayload
    )(token, secret);

    if (!decoded || typeof decoded.userId !== "string") {
      throw new UnauthorizedError("Invalid token payload", 401, "INVALID_TOKEN");
    }

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) {
      throw new UnauthorizedError("User not found", 401, "USER_NOT_FOUND");
    }

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      next(
        new UnauthorizedError(
          "Invalid or expired token",
          401,
          "INVALID_OR_EXPIRED_TOKEN",
        ),
      );
      return;
    }
    next(err);
  }
};

export default authMiddleware;
