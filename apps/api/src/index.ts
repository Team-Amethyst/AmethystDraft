import express, { Request, Response, NextFunction } from "express";
import http from "node:http";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import playersRoutes from "./routes/players";
import engineRoutes from "./routes/engine";
import leaguesRoutes from "./routes/leagues";
import internalRoutes from "./routes/internal";
import errorHandler from "./middleware/errorHandler";
import { NotFoundError } from "./lib/appError";
import customPlayerRoutes from "./routes/customPlayers";
import { assignRequestId } from "./lib/requestContext";
import { corsOptionsFromEnv } from "./lib/corsConfig";
import {
  attachSocketServer,
  shutdownSocketServer,
} from "./realtime/socketServer";
import { attachRedisAdapterIfConfigured } from "./realtime/socketIoRedisAdapter";
import { mongoConnectionOptionsFromEnv } from "./lib/mongoConnectionOptions";

dotenv.config();

const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

const app = express();

const corsOptions = corsOptionsFromEnv();

// Security headers; cross-origin so credentialed browser calls from the SPA still work.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    ...corsOptions,
    exposedHeaders: ["X-Request-Id"],
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(assignRequestId);

app.get("/", (req, res) => {
  res.send("Amethyst Draft Info API - Online");
});

app.use("/api/auth", authRoutes);
app.use("/api/players/custom", customPlayerRoutes);
app.use("/api/players", playersRoutes);
app.use("/api/engine", engineRoutes);
app.use("/api/leagues", leaguesRoutes);
app.use("/api/internal", internalRoutes);


app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Draftroom API is running" });
});

// 404 for unknown routes
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError("Route not found", 404, "ROUTE_NOT_FOUND"));
});

// Global typed error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const mongoOpts = mongoConnectionOptionsFromEnv();
const mongoUri = process.env.MONGO_URI as string;

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: shutting down gracefully…`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out; exiting.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await shutdownSocketServer();
  } catch (err) {
    console.error("Socket.IO shutdown error:", err);
  }

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });

  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
    }
  } catch (err) {
    console.error("MongoDB close error:", err);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

async function bootstrap(): Promise<void> {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, mongoOpts);
    }
    console.log(
      `Connected to MongoDB (maxPoolSize=${String(mongoOpts.maxPoolSize ?? "default")}, maxIdleTimeMS=${String(mongoOpts.maxIdleTimeMS ?? "default")})`,
    );
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }

  const io = attachSocketServer(httpServer);
  await attachRedisAdapterIfConfigured(io);

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(Number(PORT), () => {
      console.log("API running on http://localhost:" + PORT);
      resolve();
    });
    httpServer.once("error", reject);
  });
}

void bootstrap();
