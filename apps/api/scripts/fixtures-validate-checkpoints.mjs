#!/usr/bin/env node
/**
 * Print validation report for every bundled checkpoint JSON.
 *
 * Usage (from apps/api):
 *   node scripts/fixtures-validate-checkpoints.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  analyzeCheckpointJson,
  formatCheckpointReport,
} from "./lib/checkpointFixtureReport.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..");
const checkpointsDir = path.join(
  apiRoot,
  "test-fixtures",
  "player-api",
  "checkpoints",
);

/** @type {Record<string, number>} */
const EXPECTED_DRAFT_LEN = {
  pre_draft: 0,
  after_pick_10: 10,
  after_pick_50: 50,
  after_pick_100: 100,
  after_pick_130: 130,
  finished_league: 133,
};

/** @type {[string, string][]} */
const FILES = [
  ["pre_draft", "pre_draft.json"],
  ["after_pick_10", "after_10.json"],
  ["after_pick_50", "after_50.json"],
  ["after_pick_100", "after_100.json"],
  ["after_pick_130", "after_130.json"],
  ["finished_league", "finished_league.json"],
];

let failed = false;

for (const [id, fname] of FILES) {
  const filePath = path.join(checkpointsDir, fname);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING ${filePath}`);
    failed = true;
    continue;
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const report = analyzeCheckpointJson(json, {
    checkpointName: id,
    filePath,
  });
  console.info(formatCheckpointReport(report));
  console.info("");

  const want = EXPECTED_DRAFT_LEN[id];
  if (report.draftStateLength !== want) {
    console.error(
      `FAIL ${id}: draft_state.length ${report.draftStateLength} !== ${want}`,
    );
    failed = true;
  }
  if (report.auctionPicksWithMissingOrZeroSalary > 0) {
    console.error(
      `FAIL ${id}: ${report.auctionPicksWithMissingOrZeroSalary} auction pick(s) with missing/zero salary`,
    );
    failed = true;
  }
}

const hashes = new Map();
for (const [, fname] of FILES) {
  const filePath = path.join(checkpointsDir, fname);
  const raw = fs.readFileSync(filePath, "utf8");
  const h = raw.length + "|" + (JSON.parse(raw).draft_state?.length ?? -1);
  if (hashes.has(h)) {
    console.error(
      `FAIL duplicate checkpoint payload fingerprint: ${fname} vs ${hashes.get(h)}`,
    );
    failed = true;
  } else {
    hashes.set(h, fname);
  }
}

if (failed) process.exit(1);
console.info("All checkpoint fixtures passed validation.");
