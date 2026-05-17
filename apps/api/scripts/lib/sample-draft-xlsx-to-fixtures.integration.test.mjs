import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..", "..");
const fixturesPlayerApi = path.join(apiRoot, "test-fixtures", "player-api");

/** @type {string[]} */
let tmpDirs = [];

afterEach(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  tmpDirs = [];
});

function mkScratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wide-xlsx-smoke-"));
  tmpDirs.push(dir);
  return dir;
}

function writeMinimal40Man(outDir) {
  const payload = {
    schema: "checkpoint_mlb_40man_v2",
    generated_at: new Date().toISOString(),
    entries: [
      {
        player_id: "666201",
        name: "Alek Manoah",
        abbr: "LAA",
        raw_position: "P",
        fantasy_pitch: "SP",
      },
    ],
    season_used_for_pitch_roles: 2025,
  };
  fs.writeFileSync(
    path.join(outDir, "mlb-statsapi-40man-index.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

function writeSmokeWorkbook(xlsxPath) {
  const wb = XLSX.utils.book_new();
  const pre = [
    ["Team A $260", "", "", ""],
    ["1B", "Alek Manoah", "K", 18],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pre), "Pre-Draft Roster");
  const draft = [
    ["Pick #", "Player", "POS", "MLB", "Won", "$"],
    [1, "A. Manoah", "SP", "LAA", "Team A", 25],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(draft), "Draft");
  XLSX.writeFile(wb, xlsxPath);
}

describe("sample-draft-xlsx-to-fixtures (wide + --strict)", () => {
  it("exits 0 and writes checkpoints for a minimal wide 2026 workbook", () => {
    const outDir = mkScratch();
    const xlsxPath = path.join(outDir, "smoke.xlsx");

    fs.copyFileSync(
      path.join(fixturesPlayerApi, "league.base.json"),
      path.join(outDir, "league.base.json"),
    );
    writeMinimal40Man(outDir);
    writeSmokeWorkbook(xlsxPath);

    const script = path.join(apiRoot, "scripts", "sample-draft-xlsx-to-fixtures.mjs");
    const r = spawnSync(
      process.execPath,
      [script, xlsxPath, outDir, "--strict"],
      { cwd: apiRoot, encoding: "utf8" },
    );

    expect(r.error, r.stderr).toBeUndefined();
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);

    const after10 = JSON.parse(
      fs.readFileSync(path.join(outDir, "checkpoints", "after_10.json"), "utf8"),
    );
    expect(after10.draft_state).toHaveLength(1);
    expect(after10.draft_state[0].player_id).toBe("666201");
    expect(after10.pre_draft_rosters?.[0]?.players?.[0]?.player_id).toBe("666201");
  });
});
