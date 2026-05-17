/**
 * Minors / Taxi wide-sheet parsers (Team A–I columns; slot + name pairs).
 */

import { parsePreDraftTeamBudgetHeader } from "./checkpointMlbResolver.mjs";
import { finalizeCheckpointPlayerPositions } from "./checkpointFantasyPositions.mjs";
import { sanitizeKeeperDisplay } from "./checkpointWide2026Draft.mjs";
import { resolveFixturePlayerDisplay } from "./checkpointFixtureResolve.mjs";

/** @param {unknown} cell */
export function parseFantasyTeamLabelFromCell(cell) {
  const budget = parsePreDraftTeamBudgetHeader(cell);
  if (budget) return budget.name;
  const t = String(cell ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const m = /^Team\s+([A-Za-z])\s*$/i.exec(t);
  return m ? `Team ${m[1].toUpperCase()}` : null;
}

/**
 * @typedef {{ headerRowIndex: number; teams: { fantasyName: string; slotCol: number; nameCol: number }[] }} ReserveSheetBlock
 */

/** @param {unknown[][]} matrix */
export function discoverReserveSheetBlocks(matrix) {
  /** @type {ReserveSheetBlock[]} */
  const blocks = [];
  const rows = matrix ?? [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    /** @type {ReserveSheetBlock["teams"]} */
    const teams = [];
    for (let c = 0; c < row.length; c++) {
      const fantasyName = parseFantasyTeamLabelFromCell(row[c]);
      if (!fantasyName) continue;
      /* Minors/Taxi: slot in col before header (e.g. `1 | Name | 1 | Name`). */
      const nameCol = c;
      const slotCol = Math.max(0, c - 1);
      teams.push({ fantasyName, slotCol, nameCol });
    }
    if (teams.length >= 1) blocks.push({ headerRowIndex: r, teams });
  }
  return blocks;
}

/**
 * @typedef {{ team_id: string; fantasyName: string; roster_slot: string; displayName: string }} ParsedReserveRow
 */

/**
 * @param {unknown[][]} matrix
 * @param {Map<string, string>} fantasyTeamToIdMap
 * @returns {ParsedReserveRow[]}
 */
export function parseWideReserveSheet(matrix, fantasyTeamToIdMap) {
  const blocks = discoverReserveSheetBlocks(matrix);
  /** @type {ParsedReserveRow[]} */
  const out = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const { headerRowIndex, teams } = blocks[bi];
    const dataEnd =
      bi + 1 < blocks.length ? blocks[bi + 1].headerRowIndex : matrix.length;

    for (let r = headerRowIndex + 1; r < dataEnd; r++) {
      const row = matrix[r] ?? [];
      const rowLooksLikeHeader = discoverReserveSheetBlocks([row]).length > 0;
      if (rowLooksLikeHeader) continue;

      for (const t of teams) {
        const displayName = sanitizeKeeperDisplay(row[t.nameCol]);
        if (!displayName) continue;
        if (/^team\s+[a-z]$/i.test(displayName.trim())) continue;

        const team_id = fantasyTeamToIdMap.get(t.fantasyName);
        if (!team_id) {
          throw new Error(
            `Fantasy team not mapped: ${t.fantasyName} (reserve sheet block)`,
          );
        }

        const slotRaw = String(row[t.slotCol] ?? "").trim();
        out.push({
          team_id,
          fantasyName: t.fantasyName,
          roster_slot: slotRaw || "RES",
          displayName,
        });
      }
    }
  }
  return out;
}

/**
 * @param {ParsedReserveRow[]} parsed
 * @param {readonly { player_id: string; name: string; abbr: string }[]} fortyManEntries
 * @param {Record<string, unknown>} overrides
 * @param {string} context minors | taxi
 * @param {string[]} warnings
 * @param {{ defaultRosterSlot: string }} opts
 */
export function materializeWideReservePlayers(
  parsed,
  fortyManEntries,
  overrides,
  context,
  warnings,
  opts,
) {
  /** @type {Map<string, object[]>} */
  const byTeam = new Map();
  const idMap = new Map(fortyManEntries.map((e) => [String(e.player_id), e]));

  for (const row of parsed) {
    const resolved = resolveFixturePlayerDisplay(
      fortyManEntries,
      row.displayName,
      overrides,
      context,
      warnings,
      { allowSynthetic: true },
    );

    const fe = idMap.get(String(resolved.player_id)) ?? null;
    const fin = finalizeCheckpointPlayerPositions({
      workbookSlotRaw: opts.defaultRosterSlot,
      fortyEntry: fe,
      sheetPositions: undefined,
    });

    const pl = byTeam.get(row.team_id) ?? [];
    pl.push({
      player_id: resolved.player_id,
      name: resolved.name,
      team: resolved.team === "UNK" ? "" : resolved.team,
      team_id: row.team_id,
      paid: 0,
      is_keeper: false,
      roster_slot: fin.roster_slot || opts.defaultRosterSlot,
      positions: fin.positions,
      ...(resolved.unresolved ? { fixture_unresolved: true } : {}),
    });
    byTeam.set(row.team_id, pl);
  }

  return [...byTeam.entries()].map(([team_id, players]) => ({
    team_id,
    players,
  }));
}
