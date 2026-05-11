import type { Server as HttpServer } from "node:http";
import { Server, type Server as SocketIoServer } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import User from "../models/User";
import { socketIoServerCors } from "../lib/corsConfig";
import {
  initNewsSignalsPoller,
  registerNewsSignalsSubscriber,
  unregisterNewsSignalsSubscriber,
} from "./newsSignalsPoller";

/** Set when Socket.IO attaches; used for diagnostics only. */
let ioSingleton: SocketIoServer | null = null;

/** Number of authenticated Socket.IO connections (for ops / GET debug). */
export function getSocketIoConnectionsCount(): number {
  if (!ioSingleton) return 0;
  return ioSingleton.sockets.sockets.size;
}

function socketAuthError(message: string): Error {
  const e = new Error(message);
  e.name = "AuthenticationError";
  return e;
}

export function attachSocketServer(httpServer: HttpServer): SocketIoServer {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: socketIoServerCors(),
    transports: ["websocket", "polling"],
  });

  ioSingleton = io;
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

      /** Playwright E2E stub only — never set in production. */
      if (process.env.DRAFTROOM_E2E_STUB === "1") {
        socket.data.userId = decoded.userId;
        return next();
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
