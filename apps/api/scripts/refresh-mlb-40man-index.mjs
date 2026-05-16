/**
 * Refresh only `test-fixtures/player-api/mlb-statsapi-40man-index.json` from MLB StatsAPI.
 *
 * Usage (from apps/api):
 *   CHECKPOINT_ROSTER_STATS_SEASON=2025 node scripts/refresh-mlb-40man-index.mjs
 */

import path from "path";
import { fileURLToPath } from "url";
import {
  fetchFortyManRosterIndex,
  writeFortyManIndex,
} from "./lib/checkpointMlbResolver.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..");
const outPath = path.join(
  apiRoot,
  "test-fixtures",
  "player-api",
  "mlb-statsapi-40man-index.json",
);

const seasonEnv = Number(process.env.CHECKPOINT_ROSTER_STATS_SEASON || "");
const payload = await fetchFortyManRosterIndex(
  Number.isFinite(seasonEnv) && seasonEnv >= 1900 ? { seasonYear: seasonEnv } : {},
);
writeFortyManIndex(outPath, payload);
console.info("[rosters] wrote", outPath, "schema", payload.schema);
