/**
 * Human-readable summary of a wide workbook conversion (stdout + test assertions).
 */

/**
 * @param {object} stats
 * @param {number} stats.teamCount
 * @param {Record<string, number>} stats.keeperCountsByFantasyName
 * @param {Record<string, number>} stats.remainingBudgetsByFantasyName
 * @param {number} stats.draftPickCount
 * @param {Record<string, number>} stats.minorsCountsByFantasyName
 * @param {Record<string, number>} stats.taxiCountsByFantasyName
 * @param {number} stats.unresolvedCount
 * @param {string[]} [stats.warnings]
 */
export function formatFixtureConversionSummary(stats) {
  const lines = [
    "── Fixture conversion summary ──",
    `Teams: ${stats.teamCount}`,
    `Draft picks: ${stats.draftPickCount}`,
    `Unresolved players: ${stats.unresolvedCount}`,
    "",
    "Keeper counts:",
    ...Object.entries(stats.keeperCountsByFantasyName)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([team, n]) => `  ${team}: ${n}`),
    "",
    "Remaining budgets (pre-draft headers):",
    ...Object.entries(stats.remainingBudgetsByFantasyName)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([team, n]) => `  ${team}: $${n}`),
    "",
    "Minors counts:",
    ...Object.entries(stats.minorsCountsByFantasyName ?? {})
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([team, n]) => `  ${team}: ${n}`),
    "",
    "Taxi counts:",
    ...Object.entries(stats.taxiCountsByFantasyName ?? {})
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([team, n]) => `  ${team}: ${n}`),
  ];

  if (stats.warnings?.length) {
    lines.push("", `Warnings (${stats.warnings.length}, first 10):`);
    for (const w of stats.warnings.slice(0, 10)) lines.push(`  ${w}`);
  }

  return lines.join("\n");
}

export function printFixtureConversionSummary(stats) {
  console.info(formatFixtureConversionSummary(stats));
}

/**
 * @param {{ team_id: string; players: unknown[] }[]} sections
 * @param {Map<string, string>} fantasyTeamToId inverted: team_id → fantasy name
 */
export function keeperCountsFromSections(sections, fantasyTeamToId) {
  /** @type {Record<string, number>} */
  const byFantasy = {};
  const idToFantasy = new Map();
  for (const [name, id] of fantasyTeamToId) idToFantasy.set(id, name);

  for (const sec of sections) {
    const fantasy = idToFantasy.get(sec.team_id) ?? sec.team_id;
    byFantasy[fantasy] = (byFantasy[fantasy] ?? 0) + (sec.players?.length ?? 0);
  }
  return byFantasy;
}

/**
 * @param {Map<string, string>} fantasyTeamToId
 * @param {Map<string, number>} budgetsByTeamId team_id → remaining $
 */
export function remainingBudgetsByFantasyName(fantasyTeamToId, budgetsByTeamId) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [fantasy, tid] of fantasyTeamToId) {
    const v = budgetsByTeamId.get(tid);
    if (v != null) out[fantasy] = v;
  }
  return out;
}

/**
 * @param {{ team_id: string; players: unknown[] }[]} sections
 * @param {Map<string, string>} fantasyTeamToId
 */
export function reserveCountsFromSections(sections, fantasyTeamToId) {
  return keeperCountsFromSections(sections, fantasyTeamToId);
}
