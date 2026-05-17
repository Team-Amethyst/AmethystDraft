#!/usr/bin/env node
/**
 * Re-import roster rows for a demo league from a bundled checkpoint fixture.
 *
 * Usage (from apps/api):
 *   node scripts/refresh-demo-pre-draft-league.mjs
 *   DEMO_CHECKPOINT_KEY=after_pick_10 node scripts/refresh-demo-pre-draft-league.mjs
 *   DEMO_LEAGUE_REFRESH=1 pnpm exec vitest run src/lib/demoLeagueMongoRefresh.integration.test.ts
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..");

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "src/lib/demoLeagueMongoRefresh.integration.test.ts",
  ],
  {
    cwd: apiRoot,
    stdio: "inherit",
    env: { ...process.env, DEMO_LEAGUE_REFRESH: "1" },
  },
);

process.exit(result.status === 0 ? 0 : result.status ?? 1);
