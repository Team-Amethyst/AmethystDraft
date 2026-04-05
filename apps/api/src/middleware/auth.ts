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
      // res.status(401).json({ message: "No token provided" });
      // return;
      throw new UnauthorizedError("No token provided", 401, "NO_TOKEN");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      // res.status(401).json({ message: "No token provided" });
      // return;
      throw new UnauthorizedError("No token provided", 401, "NO_TOKEN");
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      // res
      //   .status(500)
      //   .json({ message: "Server misconfiguration: missing JWT secret" });
      // return;
      throw new InternalServerError("Server misconfiguration: missing JWT secret", 500, "JWT_SECRET_MISSING");
    }

    const decoded = (
      jwt.verify as (token: string, secret: string) => JwtPayload
    )(token, secret);

    if (!decoded || typeof decoded.userId !== "string") {
      // res.status(401).json({ message: "Invalid token payload" });
      // return;
      throw new UnauthorizedError("Invalid token payload", 401, "INVALID_TOKEN");
    }

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) {
      // res.status(401).json({ message: "User not found" });
      // return;
      throw new UnauthorizedError("User not found", 401, "USER_NOT_FOUND");
    }

    req.user = user;
    next();
  } catch (err) {
    // res.status(401).json({ message: "Invalid or expired token" });
    // CHANGED: More specific error handling for JWT errors, and forwarding to next() instead of sending response directly
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Invalid or expired token", 401, "INVALID_OR_EXPIRED_TOKEN");
    }
    next(err);
  }
};

export default authMiddleware;
