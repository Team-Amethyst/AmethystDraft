import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import playersRoutes from "./routes/players";
import engineRoutes from "./routes/engine";
import leaguesRoutes from "./routes/leagues";
import { sendError } from "./lib/apiResponse";

dotenv.config();

const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Amethyst Draft Info API - Online");
});

app.use("/api/auth", authRoutes);
app.use("/api/players", playersRoutes);
app.use("/api/engine", engineRoutes);
app.use("/api/leagues", leaguesRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Draftroom API is running" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  sendError(res, 500, {
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong!",
  });
});

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () =>
      console.log("API running on http://localhost:" + PORT),
    );
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
