/**
 * Parse "wide" 2026 workbook: multi-column Pre-Draft roster + Draft (Pick#/Won/Salary columns).
 */

import {
  canonicalMlbAbbrevFromSheet,
  parsePreDraftTeamBudgetHeader,
  resolveAbbreviatedKeeper,
  resolveDraftPick,
} from "./checkpointMlbResolver.mjs";
import { finalizeCheckpointPlayerPositions } from "./checkpointFantasyPositions.mjs";

/** @param {import("xlsx").WorkBook} wb @param {typeof import("xlsx")} XLSX */
export function isWide2026WorkbookLayout(wb, XLSX) {
  const draftName =
    wb.SheetNames.find((n) => /^draft$/i.test(n.trim())) ??
    wb.SheetNames.find((n) => n.toLowerCase().includes("draft"));
  if (!draftName || !wb.Sheets[draftName]) return false;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[draftName], { defval: "" });
  const first = rows[0];
  if (!first || typeof first !== "object") return false;
  const keys = Object.keys(first);
  const hasPick = keys.some((k) => /^pick\s*#/i.test(String(k).trim()));
  const hasWon = keys.some((k) => String(k).trim().toLowerCase() === "won");
  const hasPlayer = keys.some((k) => String(k).trim().toLowerCase() === "player");
  return hasPick && hasWon && hasPlayer;
}

/** Strip cells like "X. Edwards (2/S)" → "X. Edwards". */
export function sanitizeKeeperDisplay(cell) {
  return String(cell ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One visual block on the Pre-Draft sheet (e.g. Team A–E on row 0, Team F–I on row 24).
 * @typedef {{ headerRowIndex: number; groups: ReturnType<typeof discoverPreDraftColumnGroups> }} PreDraftSheetBlock
 */

/**
 * @param {unknown[]} headerRow One row from sheet_to_json matrix
 */
export function discoverPreDraftColumnGroups(headerRow) {
  /** @type {{ start: number; fantasyName: string; width: number; preDraftBudget?: number }[]} */
  const groups = [];
  const row = headerRow ?? [];

  for (let c = 0; c < row.length; c++) {
    const meta = parsePreDraftTeamBudgetHeader(row[c]);
    if (!meta) continue;

    let nextTeam = row.length;
    for (let j = c + 1; j < row.length; j++) {
      if (parsePreDraftTeamBudgetHeader(row[j])) {
        nextTeam = j;
        break;
      }
    }

    let w = Math.max(nextTeam - c, 4);
    /* typical block: roster slot | name | contract code | keeper $ */
    w = Math.min(w, Math.max(nextTeam - c, 4));
    groups.push({
      start: c,
      fantasyName: meta.name,
      width: w,
      preDraftBudget: meta.budget,
    });
    c = nextTeam - 1;
  }
  return groups;
}

/**
 * Wide 2026 Pre-Draft sheets repeat the same column layout in multiple blocks
 * (e.g. Team A–E in the top header row, Team F–I in a lower header row).
 */
export function discoverPreDraftBlocks(matrix) {
  /** @type {PreDraftSheetBlock[]} */
  const blocks = [];
  const rows = matrix ?? [];
  for (let r = 0; r < rows.length; r++) {
    const groups = discoverPreDraftColumnGroups(rows[r]);
    if (groups.length > 0) blocks.push({ headerRowIndex: r, groups });
  }
  return blocks;
}

/**
 * @param {unknown[]} row
 * @param {ReturnType<typeof discoverPreDraftColumnGroups>[number]} g
 * @param {Map<string, string>} fantasyTeamToIdMap
 */
function parseWidePreDraftKeeperCells(row, g, fantasyTeamToIdMap) {
  const rosterSlot = String(row[g.start] ?? "").trim();
  const displayName = sanitizeKeeperDisplay(row[g.start + 1] ?? "");
  const paidRaw = row[g.start + 3];
  if (!displayName) return null;

  const paidNum =
    typeof paidRaw === "number"
      ? paidRaw
      : Number.parseInt(String(paidRaw ?? "").replace(/\D/g, ""), 10) || 1;

  const fid = fantasyTeamToIdMap.get(g.fantasyName);
  if (!fid)
    throw new Error(`Fantasy team not mapped: ${g.fantasyName} (pre-draft block)`);

  return {
    fantasyName: g.fantasyName,
    team_id: fid,
    roster_slot: rosterSlot || "?",
    displayName,
    paid: paidNum,
  };
}

/** @typedef {{ fantasyName:string, team_id:string, paid:number, roster_slot:string, displayName:string }} PreKeeperDraft */

/** @returns {PreKeeperDraft[]} */
export function parseWidePreDraftRoster(matrix, fantasyTeamToIdMap) {
  if (!matrix?.length) return [];
  const blocks = discoverPreDraftBlocks(matrix);
  if (blocks.length === 0) return [];

  /** @type {PreKeeperDraft[]} */
  const keepers = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const { headerRowIndex, groups } = blocks[bi];
    const dataEnd =
      bi + 1 < blocks.length ? blocks[bi + 1].headerRowIndex : matrix.length;

    for (let r = headerRowIndex + 1; r < dataEnd; r++) {
      const row = matrix[r];
      if (!row || discoverPreDraftColumnGroups(row).length > 0) continue;

      for (const g of groups) {
        const parsed = parseWidePreDraftKeeperCells(row, g, fantasyTeamToIdMap);
        if (parsed) keepers.push(parsed);
      }
    }
  }
  return keepers;
}

/**
 * Remaining auction $ from every `Team X $NNN` header row (pre-draft sheet).
 * @param {unknown[][]} matrix
 * @param {Map<string, string>} fantasyTeamToIdMap
 */
export function derivePreDraftRemainingBudgets(matrix, fantasyTeamToIdMap) {
  /** @type {Map<string, number>} team_id → remaining $ */
  const budgets = new Map();
  for (const { groups } of discoverPreDraftBlocks(matrix)) {
    for (const g of groups) {
      if (g.preDraftBudget == null) continue;
      const tid = fantasyTeamToIdMap.get(g.fantasyName);
      if (tid) budgets.set(tid, g.preDraftBudget);
    }
  }
  return budgets;
}

/**
 * Wallet remaining at a checkpoint.
 * Pre-Draft headers are already **post-keeper** remaining $; only subtract auction picks in `draftSlice`.
 */
export function computeBudgetByTeamIdForCheckpoint({
  fantasyTeamToId,
  teamsOrdered,
  headerRemainingByTeamId,
  draftSlice,
}) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const nm of teamsOrdered) {
    const tid = fantasyTeamToId.get(nm);
    if (!tid) continue;
    const start = headerRemainingByTeamId.get(tid);
    if (start == null) continue;
    let draftSpend = 0;
    for (const p of draftSlice) {
      if (p.team_id !== tid) continue;
      draftSpend += typeof p.paid === "number" ? p.paid : 0;
    }
    out[tid] = Math.max(0, start - draftSpend);
  }
  return out;
}

/**
 * @typedef {{pick_number:number, player:string, positions?: string[], team_mlb:string, fantasyWinner:string, paid:number, fantasyBroughtUp?: string, salaryMissing?: boolean}} ParsedDraftWide
 */

/** Fix pasted cells like “DTeam D Santana” → draft-style “D. Santana”. */
export function sanitizeDraftPickPlayer(cell) {
  const s = String(cell ?? "").replace(/\s+/g, " ").trim();
  const m = /^dteam\s+([A-Za-z])\s+(.+)$/i.exec(s);
  if (!m) return s;
  return `${m[1].toUpperCase()}. ${m[2].trim()}`;
}

/** @param {Record<string, unknown>} rowObj */
export function parseDraftRowObject(rowObj) {
  const keys = Object.keys(rowObj);

  const pi = keys.findIndex((k) => /^pick\s*#/i.test(String(k).trim()));
  if (pi < 0) throw new Error("Draft sheet: Pick # column not found.");

  const pickNumber = Number(rowObj[keys[pi]]);
  if (!Number.isFinite(pickNumber))
    throw new Error(`Draft sheet: invalid pick # (${String(rowObj[keys[pi]])})`);

  const playerKey = keys.find((k) => String(k).trim().toLowerCase() === "player");
  if (!playerKey)
    throw new Error("Draft sheet: Player column not found.");
  const pkIndex = keys.indexOf(playerKey);
  /*
   * Sheets may inject columns (e.g. “Brought Up”) left of Player.
   * Layout is always: Player | POS | MLB abbrev | … Won.
   */
  const posKey = keys[pkIndex + 1];
  const mlbKey = keys[pkIndex + 2];
  const player = sanitizeDraftPickPlayer(playerObjVal(rowObj, playerKey));

  const posCell = rowObj[posKey ?? ""];
  const positions = String(posCell ?? "")
    .trim()
    .split(/[/,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const teamMlb = String(rowObj[mlbKey ?? ""] ?? "").trim();

  const wonKey = keys.find((k) => String(k).trim().toLowerCase() === "won");
  const fantasyWinner = String(rowObj[wonKey ?? ""] ?? "").trim();

  const broughtKey = keys.find((k) => /brought/i.test(String(k).trim()));
  const fantasyBroughtUp = broughtKey ? String(rowObj[broughtKey] ?? "").trim() : "";

  const salaryKey =
    keys.find((k) => /\$|salary/i.test(String(k))) ?? keys[keys.length - 1];
  const paidRaw = salaryKey !== undefined ? rowObj[salaryKey] : "";
  const { paid, salaryMissing } = parseDraftAuctionSalary(paidRaw);

  /** @returns {ParsedDraftWide} */
  const out = {
    pick_number: pickNumber,
    player,
    positions: positions.length ? positions : undefined,
    team_mlb: teamMlb,
    fantasyWinner,
    fantasyBroughtUp,
    paid,
    salaryMissing,
  };
  return out;
}

/**
 * Auction Salary must be a positive number. Blank cells are not treated as $0.
 * @returns {{ paid: number, salaryMissing: boolean }}
 */
export function parseDraftAuctionSalary(paidRaw) {
  if (typeof paidRaw === "number" && Number.isFinite(paidRaw)) {
    if (paidRaw > 0) return { paid: paidRaw, salaryMissing: false };
    return { paid: NaN, salaryMissing: true };
  }
  const s = String(paidRaw ?? "").trim();
  if (!s) return { paid: NaN, salaryMissing: true };
  const n = Number.parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return { paid: NaN, salaryMissing: true };
  return { paid: n, salaryMissing: false };
}

function playerObjVal(o, k) {
  const v = o[k];
  return v ?? "";
}

/**
 * @param {ParsedDraftWide} p
 * @param {{ draftPicksByPick?: Record<string, { player_id?: string }> }} [pickResolve]
 */
export function buildDraftPickWide(
  p,
  fantasyTeamToIdMap,
  fortyManEntries,
  displayOverrides = {},
  pickResolve = {},
) {
  const team_id = fantasyTeamToIdMap.get(p.fantasyWinner);
  if (!team_id) throw new Error(`Unknown Won team "${p.fantasyWinner}" for ${p.player}`);

  const { player_id, name } = resolveDraftPick(
    fortyManEntries,
    p.player,
    p.team_mlb,
    displayOverrides,
    {
      pickNumber: p.pick_number,
      draftPicksByPick: pickResolve.draftPicksByPick ?? {},
    },
  );

  const idMap = new Map(fortyManEntries.map((e) => [String(e.player_id), e]));
  const fe = idMap.get(String(player_id)) ?? null;

  const fin = finalizeCheckpointPlayerPositions({
    workbookSlotRaw: "",
    fortyEntry: fe,
    sheetPositions: p.positions,
  });

  const sheetAbbr =
    canonicalMlbAbbrevFromSheet(String(p.team_mlb ?? "").trim()) || "";
  const teamResolved = sheetAbbr || /** @type {any}*/ (fe)?.abbr || "";

  return {
    player_id,
    name,
    positions: fin.positions,
    team: teamResolved,
    team_id,
    paid: p.paid,
    pick_number: p.pick_number,
    is_keeper: false,
    roster_slot: fin.roster_slot,
  };
}

/**
 * @returns {{fantasyTeamToId: Map<string, string>, budgetByFantasyTeam: Map<string, number>, teamsOrdered: string[]}}
 */
export function deriveFantasyLeagueTeams(preDraftMatrix, draftRowObjs) {
  /** @type {Set<string>} */
  const fantasy = new Set();

  /** @type {Map<string, number>} */
  const budgets = new Map();

  const matrix = Array.isArray(preDraftMatrix?.[0])
    ? /** @type {unknown[][]} */ (preDraftMatrix)
    : preDraftMatrix?.length
      ? [/** @type {unknown[]} */ (preDraftMatrix)]
      : [];

  for (const { groups } of discoverPreDraftBlocks(matrix)) {
    for (const g of groups) {
      fantasy.add(g.fantasyName);
      if (g.preDraftBudget != null) budgets.set(g.fantasyName, g.preDraftBudget);
    }
  }

  for (const ro of draftRowObjs) {
    const pr = parseDraftRowObject(ro);
    if (pr.fantasyWinner) fantasy.add(pr.fantasyWinner);
    if (pr.fantasyBroughtUp) fantasy.add(pr.fantasyBroughtUp);
  }

  const ordered = [...fantasy].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  );

  /** @type {Map<string, string>} */
  const fantasyTeamToId = new Map();
  ordered.forEach((nm, idx) => fantasyTeamToId.set(nm, `team_${idx + 1}`));

  return { fantasyTeamToId, budgetByFantasyTeam: budgets, teamsOrdered: ordered };
}

/**
 * @returns {{ team_id: string; players: object[] }[]}
 */
export function materializeWideKeepers(parsedKeepers, fortyManEntries, overrides) {
  /** @type {Map<string, object[]>} */
  const byTeam = new Map();

  const idMap = new Map(fortyManEntries.map((e) => [String(e.player_id), e]));

  for (const row of parsedKeepers) {
    const resolved = resolveAbbreviatedKeeper(
      fortyManEntries,
      row.displayName,
      overrides,
    );

    const fe = idMap.get(String(resolved.player_id)) ?? null;

    const fin = finalizeCheckpointPlayerPositions({
      workbookSlotRaw: row.roster_slot,
      fortyEntry: fe,
      sheetPositions: undefined,
    });

    const pl = byTeam.get(row.team_id) ?? [];
    pl.push({
      player_id: resolved.player_id,
      name: resolved.name,
      team: resolved.team,
      team_id: row.team_id,
      paid: row.paid,
      is_keeper: true,
      roster_slot: fin.roster_slot,
      positions: fin.positions,
    });
    byTeam.set(row.team_id, pl);
  }

  return [...byTeam.entries()].map(([team_id, players]) => ({
    team_id,
    players,
  }));
}
