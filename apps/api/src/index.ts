import dotenv from "dotenv";

dotenv.config();

import http from "node:http";
import mongoose from "mongoose";
import { buildApp } from "./app";
import {
  attachSocketServer,
  shutdownSocketServer,
} from "./realtime/socketServer";
import { attachRedisAdapterIfConfigured } from "./realtime/socketIoRedisAdapter";
import { mongoConnectionOptionsFromEnv } from "./lib/mongoConnectionOptions";

const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

const app = buildApp();

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const mongoOpts = mongoConnectionOptionsFromEnv();
const mongoUri = process.env.MONGO_URI as string;
const serviceName =
  process.env.SERVICE_NAME?.trim() || process.env.AWS_APPRUNNER_SERVICE_ID?.trim() || "draftroom-api";

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
    const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";
    const poolLog = {
      service: serviceName,
      pid: process.pid,
      NODE_ENV: process.env.NODE_ENV ?? "(unset)",
      mongoDatabase: dbName,
      maxPoolSize: mongoOpts.maxPoolSize,
      minPoolSize: mongoOpts.minPoolSize,
      maxConnecting: mongoOpts.maxConnecting,
      maxIdleTimeMS: mongoOpts.maxIdleTimeMS,
      serverSelectionTimeoutMS: mongoOpts.serverSelectionTimeoutMS,
      socketTimeoutMS: "(driver default — not set in Draftroom)",
    };
    console.log(`[mongo] connected ${JSON.stringify(poolLog)}`);
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
