#!/usr/bin/env node
/**
 * Compare Draft checkpoint fixtures with AmethystAPI checkpoints (SHA-256).
 * Logical payloads share checkpoint ids; filenames differ — see ENGINE_AGENT_BRIEF.md.
 *
 * Usage (from AmethystDraft repo root):
 *   node scripts/compare-engine-checkpoints.mjs ../AmethystAPI
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT_DRAFT = path.resolve(__dirname, "..");
const DRAFT_DIR = path.join(
  ROOT_DRAFT,
  "apps",
  "api",
  "test-fixtures",
  "player-api",
  "checkpoints",
);

const PAIRS = [
  ["pre_draft.json", "pre_draft.json"],
  ["after_10.json", "after_pick_10.json"],
  ["after_50.json", "after_pick_50.json"],
  ["after_100.json", "after_pick_100.json"],
  ["after_130.json", "after_pick_130.json"],
];

function sha256File(fp) {
  const h = createHash("sha256");
  h.update(readFileSync(fp));
  return h.digest("hex");
}

const engineRoot = process.argv[2];
if (!engineRoot) {
  console.error(
    "Usage: node scripts/compare-engine-checkpoints.mjs <path-to-AmethystAPI>",
  );
  process.exit(2);
}

const engineTestDir = path.resolve(
  engineRoot,
  "test-fixtures",
  "player-api",
  "checkpoints",
);

if (!existsSync(DRAFT_DIR)) {
  console.error("Draft checkpoints missing:", DRAFT_DIR);
  process.exit(1);
}
if (!existsSync(engineTestDir)) {
  console.error("Engine checkpoints missing:", engineTestDir);
  process.exit(1);
}

let mismatches = 0;
for (const [draftFile, engineFile] of PAIRS) {
  const a = path.join(DRAFT_DIR, draftFile);
  const b = path.join(engineTestDir, engineFile);
  if (!existsSync(a)) {
    console.error("Missing Draft file:", a);
    mismatches++;
    continue;
  }
  if (!existsSync(b)) {
    console.error("Missing Engine file:", b);
    mismatches++;
    continue;
  }
  const ha = sha256File(a);
  const hb = sha256File(b);
  const ok = ha === hb;
  console.log(`${draftFile} vs ${engineFile}: ${ok ? "MATCH" : "DIFFER"}`);
  if (!ok) {
    console.log(`  draft : ${ha}`);
    console.log(`  engine: ${hb}`);
    mismatches++;
  }
}

process.exit(mismatches ? 1 : 0);
