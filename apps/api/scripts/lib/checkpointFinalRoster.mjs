/**
 * Final Roster sheet validation (not embedded in valuation checkpoints).
 *
 * Checkpoints represent auction progress (keepers + draft_state + reserve pools).
 * Final Roster is a post-draft workbook view; we validate team coverage and name overlap.
 */

import { parseFantasyTeamLabelFromCell } from "./checkpointReserveSheets.mjs";
import { sanitizeKeeperDisplay } from "./checkpointWide2026Draft.mjs";
import { discoverPreDraftBlocks, discoverPreDraftColumnGroups } from "./checkpointWide2026Draft.mjs";

/**
 * @param {unknown[][]} matrix
 * @returns {{ team_id: string; displayName: string }[]}
 */
export function parseWideFinalRosterNames(matrix, fantasyTeamToIdMap) {
  /** @type {{ team_id: string; displayName: string }[]} */
  const names = [];
  const blocks = discoverPreDraftBlocks(matrix);

  for (let bi = 0; bi < blocks.length; bi++) {
    const { headerRowIndex, groups } = blocks[bi];
    const dataEnd =
      bi + 1 < blocks.length ? blocks[bi + 1].headerRowIndex : matrix.length;

    for (let r = headerRowIndex + 1; r < dataEnd; r++) {
      const row = matrix[r];
      if (!row || discoverPreDraftColumnGroups(row).length > 0) continue;

      for (const g of groups) {
        const displayName = sanitizeKeeperDisplay(row[g.start + 1]);
        if (!displayName) continue;
        const team_id = fantasyTeamToIdMap.get(g.fantasyName);
        if (!team_id) continue;
        names.push({ team_id, displayName });
      }
    }
  }
  return names;
}

/**
 * @param {object} input
 * @param {unknown[][]} input.finalMatrix
 * @param {Map<string, string>} input.fantasyTeamToId
 * @param {{ team_id: string; players: { name: string; player_id?: string }[] }[]} input.preSections
 * @param {object[]} input.draftPlayers
 * @param {{ team_id: string; players: { name: string }[] }[]} [input.minorsSections]
 * @param {{ team_id: string; players: { name: string }[] }[]} [input.taxiSections]
 */
export function validateFinalRosterSheet(input) {
  const { finalMatrix, fantasyTeamToId, preSections, draftPlayers } = input;
  /** @type {string[]} */
  const warnings = [];

  const finalNames = parseWideFinalRosterNames(finalMatrix, fantasyTeamToId);
  const teamsInFinal = new Set(finalNames.map((n) => n.team_id));

  const expectedTeams = [...fantasyTeamToId.values()];
  for (const tid of expectedTeams) {
    if (!teamsInFinal.has(tid)) {
      warnings.push(
        `FINAL_ROSTER|missing_team|team_id=${tid}|detail=No players parsed for this team on Final Roster sheet`,
      );
    }
  }

  /** @type {Set<string>} */
  const knownDisplay = new Set();
  const addKnown = (name) => {
    const k = String(name).trim().toLowerCase();
    if (k) knownDisplay.add(k);
  };

  for (const sec of preSections) {
    for (const p of sec.players) addKnown(p.name);
  }
  for (const p of draftPlayers) addKnown(p.name);
  for (const sec of input.minorsSections ?? []) {
    for (const p of sec.players) addKnown(p.name);
  }
  for (const sec of input.taxiSections ?? []) {
    for (const p of sec.players) addKnown(p.name);
  }

  let unknownInFinal = 0;
  for (const fn of finalNames) {
    const k = fn.displayName.trim().toLowerCase();
    if (!knownDisplay.has(k)) unknownInFinal += 1;
  }

  if (unknownInFinal > 0) {
    warnings.push(
      `FINAL_ROSTER|names_not_in_fixture_sources|count=${unknownInFinal}|detail=Final Roster names not found among keepers/draft/minors/taxi (abbrev matching not applied)`,
    );
  }

  return {
    finalPlayerCount: finalNames.length,
    teamsWithPlayers: teamsInFinal.size,
    warnings,
    /** Final roster is validation-only; checkpoints intentionally omit this sheet. */
    embeddedInCheckpoints: false,
  };
}
