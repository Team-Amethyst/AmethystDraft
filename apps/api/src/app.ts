import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
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
import { requestRouteMetricsMiddleware } from "./middleware/requestRouteMetrics";

/** HTTP app (routes + middleware) without Mongo listen or Socket.IO bootstrap. */
export function buildApp(): express.Application {
  const app = express();
  const corsOptions = corsOptionsFromEnv();

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
  app.use(express.json({ limit: "10mb" }));
  app.use(assignRequestId);
  app.use(requestRouteMetricsMiddleware);

  app.get("/", (req, res) => {
    res.send("Amethyst Draft Info API - Online");
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/players/custom", customPlayerRoutes);
  app.use("/api/players", playersRoutes);
  app.use("/api/engine", engineRoutes);
  app.use("/api/leagues", leaguesRoutes);
  app.use("/api/internal", internalRoutes);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Draftroom API is running",
      gitSha: process.env.DRAFTROOM_GIT_SHA || undefined,
    });
  });

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError("Route not found", 404, "ROUTE_NOT_FOUND"));
  });

  app.use(errorHandler);
  return app;
}
