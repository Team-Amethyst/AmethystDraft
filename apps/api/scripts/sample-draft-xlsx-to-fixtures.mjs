/**
 * Convert course sample draft workbook to valuation-request v1 JSON fixtures.
 *
 * Usage (from repo root):
 *   pnpm --filter api run fixtures:from-xlsx -- ./SampleDraft.xlsx ./apps/api/test-fixtures/player-api
 *
 * Expected worksheets (override with env SHEET_PRE_DRAFT, SHEET_DRAFT, SHEET_MINORS, SHEET_TAXI):
 *   - Pre-Draft Roster (or contains "pre" + "draft")
 *   - Draft
 *   - Minors (optional)
 *   - Taxi (optional)
 *
 * Row objects from sheet_to_json should include columns (case-insensitive header matching):
 *   Team / Fantasy Team -> team (display); team_id derived via team index if column TeamId missing
 *   Player ID / MLB ID / player_id -> player_id
 *   Player / Name -> name
 *   Pos / Position(s) -> positions (split on / , |)
 *   MLB Team -> team
 *   Price / $ / Paid -> paid
 *
 * league.base.json in the output directory is merged into each checkpoint payload.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normKey(k) {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function findSheet(wb, preferred, fuzzyIncludes) {
  if (wb.Sheets[preferred]) return preferred;
  const lower = fuzzyIncludes.map((s) => s.toLowerCase());
  const hit = wb.SheetNames.find((n) => {
    const x = n.toLowerCase();
    return lower.every((frag) => x.includes(frag));
  });
  return hit ?? null;
}

function rowToObj(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    o[normKey(k)] = v;
  }
  return o;
}

function getStr(o, ...keys) {
  for (const k of keys) {
    const v = o[normKey(k)];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function getNum(o, ...keys) {
  for (const k of keys) {
    const v = o[normKey(k)];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function parsePositions(raw) {
  if (!raw) return undefined;
  const s = String(raw);
  const parts = s.split(/[,/|]/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function buildTeamIdMap(teamNamesInOrder) {
  const m = new Map();
  teamNamesInOrder.forEach((name, i) => {
    m.set(name.toLowerCase(), `team_${i + 1}`);
  });
  return m;
}

function sheetToRows(wb, sheetName) {
  if (!sheetName || !wb.Sheets[sheetName]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
}

function main() {
  const [xlsxPath, outArg] = process.argv.slice(2);
  if (!xlsxPath || !outArg) {
    console.error(
      "Usage: node sample-draft-xlsx-to-fixtures.mjs <workbook.xlsx> <output-dir>",
    );
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), outArg);
  const checkpointsDir = path.join(outDir, "checkpoints");
  const leaguePath = path.join(outDir, "league.base.json");
  if (!fs.existsSync(leaguePath)) {
    console.error("Missing league.base.json in", outDir);
    process.exit(1);
  }
  const league = JSON.parse(fs.readFileSync(leaguePath, "utf8"));

  const wb = XLSX.readFile(path.resolve(process.cwd(), xlsxPath));

  const sheetPre =
    process.env.SHEET_PRE_DRAFT ||
    findSheet(wb, "Pre-Draft Roster", ["pre", "draft"]) ||
    findSheet(wb, "Pre-Draft Roster", ["pre"]);
  const sheetDraft =
    process.env.SHEET_DRAFT ||
    findSheet(wb, "Draft", ["draft"]) ||
    wb.SheetNames[0];
  const sheetMinors =
    process.env.SHEET_MINORS || findSheet(wb, "Minors", ["minor"]);
  const sheetTaxi = process.env.SHEET_TAXI || findSheet(wb, "Taxi", ["taxi"]);

  const draftRows = sheetToRows(wb, sheetDraft).map(rowToObj);

  const teamNames = [...new Set(draftRows.map((r) => getStr(r, "team", "fantasy_team", "owner")).filter(Boolean))];
  const teamIdMap = buildTeamIdMap(teamNames);

  function rowToPick(row, pickNumber) {
    const fantasyTeam = getStr(row, "team", "fantasy_team", "owner");
    const team_id =
      getStr(row, "team_id", "teamid") ||
      teamIdMap.get(fantasyTeam.toLowerCase()) ||
      "team_1";
    const player_id = getStr(row, "player_id", "mlb_id", "mlb id", "id");
    const name = getStr(row, "player", "name");
    const paid = getNum(row, "price", "paid", "$", "amount") ?? 0;
    return {
      player_id,
      name,
      positions: parsePositions(getStr(row, "pos", "position", "positions")),
      team: getStr(row, "mlb_team", "mlb team", "team_mlb"),
      team_id,
      paid,
      pick_number: pickNumber,
      is_keeper: false,
      roster_slot: getStr(row, "slot", "roster_slot") || undefined,
    };
  }

  const fullDraft = draftRows
    .map((row, idx) => rowToPick(row, idx + 1))
    .filter((p) => p.player_id && p.name);

  const preDraftRows = sheetPre ? sheetToRows(wb, sheetPre).map(rowToObj) : [];
  const preByTeam = new Map();
  for (const row of preDraftRows) {
    const fantasyTeam = getStr(row, "team", "fantasy_team", "owner");
    const team_id =
      getStr(row, "team_id", "teamid") ||
      teamIdMap.get(fantasyTeam.toLowerCase()) ||
      "team_1";
    if (!preByTeam.has(team_id)) preByTeam.set(team_id, []);
    const player_id = getStr(row, "player_id", "mlb_id", "mlb id", "id");
    const name = getStr(row, "player", "name");
    if (!player_id || !name) continue;
    preByTeam.get(team_id).push({
      player_id,
      name,
      positions: parsePositions(getStr(row, "pos", "position", "positions")),
      team: getStr(row, "mlb_team", "mlb team"),
      team_id,
      paid: getNum(row, "price", "keeper", "cost") ?? 0,
      is_keeper: true,
      roster_slot: getStr(row, "slot", "roster_slot") || undefined,
    });
  }
  const pre_draft_rosters = [...preByTeam.entries()].map(([team_id, players]) => ({
    team_id,
    players,
  }));

  function sectionFromSheet(sheet) {
    if (!sheet) return undefined;
    const rows = sheetToRows(wb, sheet).map(rowToObj);
    const byTeam = new Map();
    for (const row of rows) {
      const fantasyTeam = getStr(row, "team", "fantasy_team", "owner");
      const team_id =
        getStr(row, "team_id", "teamid") ||
        teamIdMap.get(fantasyTeam.toLowerCase()) ||
        "team_1";
      if (!byTeam.has(team_id)) byTeam.set(team_id, []);
      const player_id = getStr(row, "player_id", "mlb_id", "id");
      const name = getStr(row, "player", "name");
      if (!player_id || !name) continue;
      byTeam.get(team_id).push({
        player_id,
        name,
        positions: parsePositions(getStr(row, "pos", "position")),
        team: getStr(row, "mlb_team", "mlb team"),
        team_id,
      });
    }
    const arr = [...byTeam.entries()].map(([team_id, players]) => ({
      team_id,
      players,
    }));
    return arr.length ? arr : undefined;
  }

  const minors = sectionFromSheet(sheetMinors);
  const taxi = sectionFromSheet(sheetTaxi);

  const checkpoints = [
    ["pre_draft", 0],
    ["after_pick_10", 10],
    ["after_pick_50", 50],
    ["after_pick_100", 100],
    ["after_pick_130", 130],
  ];

  fs.mkdirSync(checkpointsDir, { recursive: true });

  for (const [checkpoint, n] of checkpoints) {
    const draft_state = fullDraft.slice(0, n);
    const doc = {
      schemaVersion: "1.0.0",
      checkpoint,
      league,
      draft_state,
      ...(pre_draft_rosters.length ? { pre_draft_rosters } : {}),
      ...(minors ? { minors } : {}),
      ...(taxi ? { taxi } : {}),
      deterministic: true,
      seed: 42,
    };
    const fname =
      checkpoint === "pre_draft"
        ? "pre_draft.json"
        : `after_${checkpoint.replace("after_pick_", "")}.json`;
    fs.writeFileSync(
      path.join(checkpointsDir, fname),
      `${JSON.stringify(doc, null, 2)}\n`,
    );
  }

  console.log("Sheets used:", {
    preDraft: sheetPre,
    draft: sheetDraft,
    minors: sheetMinors,
    taxi: sheetTaxi,
  });
  console.log("Wrote checkpoints to", checkpointsDir);
}

main();
