/**
 * Convert Activity #9 course workbook → valuation-request v1 checkpoints.
 *
 * Two layouts supported:
 *
 * “Long” workbook (tabular rows with MLB player_id columns) — legacy.
 *
 * Wide 2026 workbook (Pick#/Player/Won; multi-column pre-draft roster) — auto-detected.
 * MLB IDs come from StatsAPI 40-man rosters; regenerate index with `--fetch-rosters`.
 *
 * Usage (from apps/api):
 *   node scripts/sample-draft-xlsx-to-fixtures.mjs /path/to/2026Draft.xlsx ./test-fixtures/player-api
 *   node scripts/sample-draft-xlsx-to-fixtures.mjs /path/to/2026Draft.xlsx ./test-fixtures/player-api --strict
 *
 * Refresh roster lookup (StatsAPI ~30 team 40-man + batched season pitching hydrate for SP/RP on generic pitchers — allow tens of seconds online):
 *   node scripts/sample-draft-xlsx-to-fixtures.mjs /path/to/2026Draft.xlsx ./test-fixtures/player-api --fetch-rosters
 *
 * Sheets (override SHEET_* env): Pre-Draft Roster, Draft, Minors?, Taxi?
 *
 * league.base.json must exist in output-dir — merged into every checkpoint (`num_teams` overridden for wide).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import {
  fetchFortyManRosterIndex,
  writeFortyManIndex,
  readFortyManIndex,
  mergeFortyManWithExtras,
} from "./lib/checkpointMlbResolver.mjs";
import {
  isWide2026WorkbookLayout,
  deriveFantasyLeagueTeams,
  derivePreDraftRemainingBudgets,
  computeBudgetByTeamIdForCheckpoint,
  parseWidePreDraftRoster,
  materializeWideKeepers,
  parseDraftRowObject,
  buildDraftPickWide,
} from "./lib/checkpointWide2026Draft.mjs";
import {
  parseWideReserveSheet,
  materializeWideReservePlayers,
} from "./lib/checkpointReserveSheets.mjs";
import { validateFinalRosterSheet } from "./lib/checkpointFinalRoster.mjs";
import {
  formatFixtureConversionSummary,
  keeperCountsFromSections,
  remainingBudgetsByFantasyName,
  reserveCountsFromSections,
} from "./lib/fixtureConversionSummary.mjs";
import { partitionCheckpointOverrides } from "./lib/partitionCheckpointOverrides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} checkpoint */
function checkpointJsonFilename(checkpoint) {
  if (checkpoint === "pre_draft") return "pre_draft.json";
  if (checkpoint === "finished_league") return "finished_league.json";
  return `after_${checkpoint.replace("after_pick_", "")}.json`;
}

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

function checkpointsDir(outDir) {
  return path.join(outDir, "checkpoints");
}

function rosterCachePath(outDir) {
  return path.join(outDir, "mlb-statsapi-40man-index.json");
}

function countWideDraftRowsWithPlayerName(draftFiltered) {
  let n = 0;
  for (const raw of draftFiltered) {
    if (String(raw["Player"] ?? "").trim()) n += 1;
  }
  return n;
}

/** @returns {Promise<{ entries: { player_id:string, name:string, abbr:string }[] }>} */
async function ensureFortyManIndex(outDir, shouldFetch) {
  const rp = rosterCachePath(outDir);
  if (shouldFetch) {
    console.info(
      "[fixtures] fetching MLB rosters + SP/RP roles (many HTTP calls, tens of seconds)…",
    );
    const payload = await fetchFortyManRosterIndex();
    writeFortyManIndex(rp, payload);
    console.info("[fixtures] wrote", rp);
    return payload.entries;
  }
  if (!fs.existsSync(rp)) {
    console.error(`Missing roster index ${rp}`);
    console.error(`Run with --fetch-rosters once while online (or copy from CI artifact).`);
    process.exit(1);
  }
  return readFortyManIndex(rp);
}

async function writeWideCheckpointPayloads(opts) {
  const {
    wb,
    leagueBase,
    outDir,
    sheetPreName,
    sheetDraftName,
    sheetMinorsName,
    sheetTaxiName,
    sheetFinalName,
    fortyManEntries,
    strictMode = false,
  } = opts;

  const preMatrix = sheetPreName
    ? XLSX.utils.sheet_to_json(wb.Sheets[sheetPreName], {
        header: 1,
        defval: "",
      })
    : [[]];

  const draftObjs = sheetToRows(wb, sheetDraftName);
  /* Drop trailing blank workbook rows below the Draft log */
  const draftFiltered = draftObjs.filter((raw) =>
    /^[0-9]+$/.test(String(raw["Pick #"] ?? "").trim()),
  );

  const { fantasyTeamToId, teamsOrdered } = deriveFantasyLeagueTeams(
    /** @type {unknown[][]} */ (preMatrix),
    draftFiltered,
  );

  const headerRemainingByTeamId = derivePreDraftRemainingBudgets(
    /** @type {unknown[][]} */ (preMatrix),
    fantasyTeamToId,
  );

  /** @type {string[]} */
  const conversionWarnings = [];

  const overridePath = path.join(outDir, "checkpoint-display-overrides.json");
  const rawOverrides = fs.existsSync(overridePath)
    ? JSON.parse(fs.readFileSync(overridePath, "utf8"))
    : {};
  const { keeperMap, draftPicksByPick, extraRosterEntries } =
    partitionCheckpointOverrides(rawOverrides);

  const mergedForty = mergeFortyManWithExtras(fortyManEntries, extraRosterEntries);

  const parsedKeepers = parseWidePreDraftRoster(
    /** @type {unknown[][]} */ (preMatrix),
    fantasyTeamToId,
  );
  /** @type {{ team_id: string; players: object[] }[]} */
  let preSections = materializeWideKeepers(parsedKeepers, mergedForty, keeperMap);

  /** Sort keepers deterministically inside each bracket */
  preSections = preSections.map(({ team_id, players }) => ({
    team_id,
    players: [...players].sort((a, b) =>
      String(a.player_id).localeCompare(String(b.player_id)),
    ),
  }));

  const minorsMatrix = sheetMinorsName
    ? XLSX.utils.sheet_to_json(wb.Sheets[sheetMinorsName], {
        header: 1,
        defval: "",
      })
    : [[]];
  const parsedMinors = parseWideReserveSheet(
    /** @type {unknown[][]} */ (minorsMatrix),
    fantasyTeamToId,
  );
  let minorsSections = materializeWideReservePlayers(
    parsedMinors,
    mergedForty,
    keeperMap,
    "minors",
    conversionWarnings,
    { defaultRosterSlot: "MIN" },
  );
  minorsSections = minorsSections.map(({ team_id, players }) => ({
    team_id,
    players: [...players].sort((a, b) =>
      String(a.player_id).localeCompare(String(b.player_id)),
    ),
  }));

  const taxiMatrix = sheetTaxiName
    ? XLSX.utils.sheet_to_json(wb.Sheets[sheetTaxiName], {
        header: 1,
        defval: "",
      })
    : [[]];
  const parsedTaxi = parseWideReserveSheet(
    /** @type {unknown[][]} */ (taxiMatrix),
    fantasyTeamToId,
  );
  let taxiSections = materializeWideReservePlayers(
    parsedTaxi,
    mergedForty,
    keeperMap,
    "taxi",
    conversionWarnings,
    { defaultRosterSlot: "TAXI" },
  );
  taxiSections = taxiSections.map(({ team_id, players }) => ({
    team_id,
    players: [...players].sort((a, b) =>
      String(a.player_id).localeCompare(String(b.player_id)),
    ),
  }));

  const finalMatrix = sheetFinalName
    ? XLSX.utils.sheet_to_json(wb.Sheets[sheetFinalName], {
        header: 1,
        defval: "",
      })
    : null;

  const expectedDraftRows = countWideDraftRowsWithPlayerName(draftFiltered);
  /** @type {{ raw: object; message: string }[]} */
  const draftSkips = [];

  /** @type {object[]} */
  const fullDraft = [];
  for (const raw of draftFiltered) {
    try {
      const parsed = parseDraftRowObject(raw);
      if (!parsed.player) continue;
      if (parsed.salaryMissing) {
        const msg = `Draft pick #${parsed.pick_number} "${parsed.player}" missing Salary`;
        if (strictMode) {
          draftSkips.push({ raw, message: msg });
          continue;
        }
        conversionWarnings.push(
          `DRAFT_SALARY_MISSING|pick=${parsed.pick_number}|name=${JSON.stringify(parsed.player)}|detail=${msg}`,
        );
        continue;
      }
      fullDraft.push(
        buildDraftPickWide(parsed, fantasyTeamToId, mergedForty, keeperMap, {
          draftPicksByPick,
        }),
      );
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      draftSkips.push({ raw, message: msg });
      console.warn("[fixtures] skipping draft row", raw, msg);
    }
  }

  if (strictMode) {
    if (draftSkips.length) {
      console.error(
        `[fixtures] --strict: ${draftSkips.length} draft row(s) failed (expected 0).`,
      );
      process.exit(1);
    }
    if (fullDraft.length !== expectedDraftRows) {
      console.error(
        `[fixtures] --strict: parsed ${fullDraft.length} draft picks but workbook has ${expectedDraftRows} non-empty Player rows.`,
      );
      process.exit(1);
    }
  }

  const leagueMerged = {
    ...leagueBase,
    num_teams: teamsOrdered.length,
    team_names: teamsOrdered,
  };

  const unresolvedCount = conversionWarnings.filter((w) =>
    w.startsWith("UNRESOLVED|"),
  ).length;

  const checkpointDefs = [
    ["pre_draft", 0],
    ["after_pick_10", 10],
    ["after_pick_50", 50],
    ["after_pick_100", 100],
    ["after_pick_130", 130],
    ["finished_league", fullDraft.length],
  ];

  fs.mkdirSync(checkpointsDir(outDir), { recursive: true });

  for (const [checkpoint, n] of checkpointDefs) {
    const draft_state = fullDraft.slice(0, n);
    const budget_by_team_id = computeBudgetByTeamIdForCheckpoint({
      fantasyTeamToId,
      teamsOrdered,
      headerRemainingByTeamId,
      draftSlice: draft_state,
    });
    const doc = {
      schemaVersion: "1.0.0",
      checkpoint,
      league: {
        ...leagueMerged,
        budget_by_team_id,
      },
      draft_state,
      ...(preSections.length ? { pre_draft_rosters: preSections } : {}),
      ...(minorsSections.length ? { minors: minorsSections } : {}),
      ...(taxiSections.length ? { taxi: taxiSections } : {}),
      deterministic: true,
      seed: 42,
    };
    const fname = checkpointJsonFilename(checkpoint);
    fs.writeFileSync(
      path.join(checkpointsDir(outDir), fname),
      `${JSON.stringify(doc, null, 2)}\n`,
    );
  }

  if (finalMatrix) {
    const finalVal = validateFinalRosterSheet({
      finalMatrix: /** @type {unknown[][]} */ (finalMatrix),
      fantasyTeamToId,
      preSections,
      draftPlayers: fullDraft,
      minorsSections,
      taxiSections,
    });
    conversionWarnings.push(...finalVal.warnings);
    conversionWarnings.push(
      "FINAL_ROSTER|not_embedded|detail=Final Roster is validated only; valuation checkpoints use pre_draft + draft_state + minors + taxi",
    );
  }

  console.log("Wide layout checkpoints written to", checkpointsDir(outDir));
  console.log("Fantasy teams:", teamsOrdered.join(", "));
  console.log(
    `Draft picks parsed: ${fullDraft.length} (intermediate checkpoints at 10/50/100/130; finished_league uses all picks)`,
  );

  const summary = {
    teamCount: teamsOrdered.length,
    keeperCountsByFantasyName: keeperCountsFromSections(
      preSections,
      fantasyTeamToId,
    ),
    remainingBudgetsByFantasyName: remainingBudgetsByFantasyName(
      fantasyTeamToId,
      headerRemainingByTeamId,
    ),
    draftPickCount: fullDraft.length,
    minorsCountsByFantasyName: reserveCountsFromSections(
      minorsSections,
      fantasyTeamToId,
    ),
    taxiCountsByFantasyName: reserveCountsFromSections(
      taxiSections,
      fantasyTeamToId,
    ),
    unresolvedCount,
    warnings: conversionWarnings,
  };
  console.info(formatFixtureConversionSummary(summary));

  return summary;
}

function writeLegacyCheckpointPayloads(opts) {
  const {
    wb,
    leagueBase,
    outDir,
    sheetPreName,
    sheetDraftName,
    sheetMinors,
    sheetTaxi,
  } = opts;

  const draftRows = sheetToRows(wb, sheetDraftName).map(rowToObj);
  const teamNames = [
    ...new Set(draftRows.map((r) => getStr(r, "team", "fantasy_team", "owner")).filter(Boolean)),
  ];
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

  const preDraftRows = sheetPreName ? sheetToRows(wb, sheetPreName).map(rowToObj) : [];
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
  fs.mkdirSync(checkpointsDir(outDir), { recursive: true });

  for (const [checkpoint, n] of [
    ["pre_draft", 0],
    ["after_pick_10", 10],
    ["after_pick_50", 50],
    ["after_pick_100", 100],
    ["after_pick_130", 130],
  ]) {
    const draft_state = fullDraft.slice(0, n);
    const doc = {
      schemaVersion: "1.0.0",
      checkpoint,
      league: leagueBase,
      draft_state,
      ...(pre_draft_rosters.length ? { pre_draft_rosters } : {}),
      ...(minors ? { minors } : {}),
      ...(taxi ? { taxi } : {}),
      deterministic: true,
      seed: 42,
    };
    const fname = checkpointJsonFilename(checkpoint);
    fs.writeFileSync(
      path.join(checkpointsDir(outDir), fname),
      `${JSON.stringify(doc, null, 2)}\n`,
    );
  }
  console.log("Legacy checkpoints written to", checkpointsDir(outDir));
}

(async function mainAsync() {
  const fetchRosters = process.argv.includes("--fetch-rosters");
  const strictMode = process.argv.includes("--strict");
  const argv = process.argv.slice(2).filter((a) => a !== "--fetch-rosters" && a !== "--strict");
  const [xlsxArg, outArg] = argv;
  if (!xlsxArg || !outArg) {
    console.error(
      "Usage: node sample-draft-xlsx-to-fixtures.mjs <workbook.xlsx> <output-dir> [--fetch-rosters] [--strict]",
    );
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), outArg);
  const leaguePath = path.join(outDir, "league.base.json");
  if (!fs.existsSync(leaguePath)) {
    console.error("Missing league.base.json in", outDir);
    process.exit(1);
  }
  const leagueBase = JSON.parse(fs.readFileSync(leaguePath, "utf8"));

  const xlsxPath = path.isAbsolute(xlsxArg)
    ? xlsxArg
    : path.resolve(process.cwd(), xlsxArg);
  if (!fs.existsSync(xlsxPath)) {
    console.error("Workbook not found:", xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);

  const sheetPre =
    process.env.SHEET_PRE_DRAFT ||
    findSheet(wb, "Pre-Draft Roster", ["pre", "draft"]) ||
    findSheet(wb, "Pre-Draft Roster", ["pre"]);
  const sheetDraft =
    process.env.SHEET_DRAFT ||
    findSheet(wb, "Draft", ["draft"]) ||
    wb.SheetNames[0];
  const sheetMinors = process.env.SHEET_MINORS || findSheet(wb, "Minors", ["minor"]);
  const sheetTaxi = process.env.SHEET_TAXI || findSheet(wb, "Taxi", ["taxi"]);

  if (isWide2026WorkbookLayout(wb, XLSX)) {
    console.info("Detected wide-format 2026 workbook layout.");
    const fortyManEntries = await ensureFortyManIndex(outDir, fetchRosters);
    const sheetFinal =
      process.env.SHEET_FINAL_ROSTER ||
      findSheet(wb, "Final Roster", ["final", "roster"]) ||
      findSheet(wb, "Final Roster", ["final"]);

    await writeWideCheckpointPayloads({
      wb,
      leagueBase,
      outDir,
      sheetPreName: sheetPre,
      sheetDraftName: sheetDraft,
      sheetMinorsName: sheetMinors,
      sheetTaxiName: sheetTaxi,
      sheetFinalName: sheetFinal,
      fortyManEntries,
      strictMode,
    });
  } else {
    writeLegacyCheckpointPayloads({
      wb,
      leagueBase,
      outDir,
      sheetPreName: sheetPre,
      sheetDraftName: sheetDraft,
      sheetMinors,
      sheetTaxi,
    });
  }

  const sheetFinalLog =
    process.env.SHEET_FINAL_ROSTER ||
    findSheet(wb, "Final Roster", ["final", "roster"]) ||
    findSheet(wb, "Final Roster", ["final"]);

  console.log("Sheets used:", {
    preDraft: sheetPre,
    draft: sheetDraft,
    minors: sheetMinors,
    taxi: sheetTaxi,
    finalRoster: sheetFinalLog,
    workbook: path.basename(xlsxPath),
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
