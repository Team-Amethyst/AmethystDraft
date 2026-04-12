/**
 * Writes synthetic Activity #9 checkpoint fixtures under test-fixtures/player-api/checkpoints/.
 * Replace with sample-draft-xlsx-to-fixtures output when the course workbook is available.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..");
const fixturesDir = path.join(apiRoot, "test-fixtures", "player-api");
const outDir = path.join(fixturesDir, "checkpoints");

const league = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "league.base.json"), "utf8"),
);

const samplePreDraft = [
  {
    team_id: "team_1",
    players: [
      {
        player_id: "660271",
        name: "Sample Keeper",
        positions: ["1B"],
        team: "TOR",
        team_id: "team_1",
        paid: 18,
        is_keeper: true,
        roster_slot: "1B",
      },
    ],
  },
];

function draftPick(i) {
  const team = (i % 12) + 1;
  const isPitcher = i % 4 === 0;
  return {
    player_id: String(660000 + i),
    name: `Sample Player ${i}`,
    positions: isPitcher ? ["SP"] : ["OF"],
    team: "NYY",
    team_id: `team_${team}`,
    paid: 5 + (i % 30),
    pick_number: i,
    is_keeper: false,
    roster_slot: isPitcher ? "SP1" : "OF1",
  };
}

function checkpointFileName(checkpoint) {
  if (checkpoint === "pre_draft") return "pre_draft.json";
  return `after_${checkpoint.replace("after_pick_", "")}.json`;
}

function writeCheckpoint(checkpoint, pickCount) {
  const draft_state = [];
  for (let i = 1; i <= pickCount; i++) {
    draft_state.push(draftPick(i));
  }
  const doc = {
    schemaVersion: "1.0.0",
    checkpoint,
    league,
    draft_state,
    pre_draft_rosters: samplePreDraft,
    deterministic: true,
    seed: 42,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, checkpointFileName(checkpoint)),
    `${JSON.stringify(doc, null, 2)}\n`,
  );
}

writeCheckpoint("pre_draft", 0);
writeCheckpoint("after_pick_10", 10);
writeCheckpoint("after_pick_50", 50);
writeCheckpoint("after_pick_100", 100);
writeCheckpoint("after_pick_130", 130);

console.log("Wrote checkpoints to", outDir);
