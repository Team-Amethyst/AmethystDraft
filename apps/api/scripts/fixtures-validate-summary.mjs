#!/usr/bin/env node
/**
 * Print keeper/budget/draft/minors/taxi summary for generated checkpoint JSON.
 *
 * Usage:
 *   node scripts/fixtures-validate-summary.mjs test-fixtures/player-api/checkpoints/pre_draft.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  formatFixtureConversionSummary,
  keeperCountsFromSections,
  reserveCountsFromSections,
} from "./lib/fixtureConversionSummary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jsonPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, "..", "test-fixtures", "player-api", "checkpoints", "pre_draft.json");

if (!fs.existsSync(jsonPath)) {
  console.error("File not found:", jsonPath);
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const league = doc.league ?? doc;
const numTeams = league.num_teams ?? 0;
const pre = doc.pre_draft_rosters ?? [];
const minors = doc.minors ?? [];
const taxi = doc.taxi ?? [];
const draft = doc.draft_state ?? doc.drafted_players ?? [];

const fantasyTeamToId = new Map();
for (let i = 0; i < numTeams; i++) {
  fantasyTeamToId.set(`Team ${String.fromCharCode(65 + i)}`, `team_${i + 1}`);
}

const budgets = league.budget_by_team_id ?? {};
const headerRemaining = new Map(Object.entries(budgets));

let unresolved = 0;
for (const sec of [...pre, ...minors, ...taxi]) {
  for (const p of sec.players ?? []) {
    if (p.fixture_unresolved || String(p.player_id).startsWith("fixture_unresolved_")) {
      unresolved += 1;
    }
  }
}

const summary = {
  teamCount: numTeams,
  keeperCountsByFantasyName: keeperCountsFromSections(pre, fantasyTeamToId),
  remainingBudgetsByFantasyName: Object.fromEntries(
    [...fantasyTeamToId.entries()].map(([fantasy, tid]) => [
      fantasy,
      headerRemaining.get(tid) ?? null,
    ]),
  ),
  draftPickCount: draft.length,
  minorsCountsByFantasyName: reserveCountsFromSections(minors, fantasyTeamToId),
  taxiCountsByFantasyName: reserveCountsFromSections(taxi, fantasyTeamToId),
  unresolvedCount: unresolved,
};

console.info(formatFixtureConversionSummary(summary));

const emptyKeeperTeams = Object.entries(summary.keeperCountsByFantasyName).filter(
  ([, n]) => n === 0,
);
if (emptyKeeperTeams.length > 0) {
  console.error(
    "ERROR: teams with zero keepers:",
    emptyKeeperTeams.map(([t]) => t).join(", "),
  );
  process.exit(1);
}
