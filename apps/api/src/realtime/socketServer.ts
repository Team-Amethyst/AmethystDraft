import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import User from "../models/User";
import { socketIoServerCors } from "../lib/corsConfig";
import {
  initNewsSignalsPoller,
  registerNewsSignalsSubscriber,
  unregisterNewsSignalsSubscriber,
} from "./newsSignalsPoller";

function socketAuthError(message: string): Error {
  const e = new Error(message);
  e.name = "AuthenticationError";
  return e;
}

export function attachSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: socketIoServerCors(),
    transports: ["websocket", "polling"],
  });

  initNewsSignalsPoller(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token.trim()) {
        return next(socketAuthError("NO_TOKEN"));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(socketAuthError("CONFIG"));
      }

      const decoded = jwt.verify(token.trim(), secret) as JwtPayload & {
        userId?: string;
      };
      if (!decoded?.userId || typeof decoded.userId !== "string") {
        return next(socketAuthError("INVALID_TOKEN"));
      }

      const user = await User.findById(decoded.userId).select("_id");
      if (!user) {
        return next(socketAuthError("USER_NOT_FOUND"));
      }

      socket.data.userId = user.id;
      next();
    } catch (err) {
      if (
        err instanceof jwt.JsonWebTokenError ||
        err instanceof jwt.TokenExpiredError
      ) {
        return next(socketAuthError("INVALID_OR_EXPIRED_TOKEN"));
      }
      next(err instanceof Error ? err : socketAuthError("AUTH_FAILED"));
    }
  });

  io.on("connection", (socket) => {
    registerNewsSignalsSubscriber();
    socket.on("disconnect", () => {
      unregisterNewsSignalsSubscriber();
    });
  });

  return io;
}
