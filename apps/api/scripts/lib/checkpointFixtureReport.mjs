/**
 * Per-checkpoint fixture report (draft_state, reserves, auction salary sanity).
 */

function countPlayersInSections(sections) {
  if (!Array.isArray(sections)) return 0;
  let n = 0;
  for (const s of sections) {
    const players = s?.players;
    if (Array.isArray(players)) n += players.length;
  }
  return n;
}

function pickSummary(row) {
  return {
    pick: row.pick_number ?? "?",
    player: row.name ?? row.player ?? "?",
    team: row.team_id ?? "?",
    salary: row.paid,
  };
}

/**
 * @param {unknown} json Parsed checkpoint document
 * @param {{ checkpointName?: string; filePath?: string }} meta
 */
export function analyzeCheckpointJson(json, meta = {}) {
  if (!json || typeof json !== "object") {
    throw new Error("Checkpoint JSON must be an object");
  }
  const doc = /** @type {Record<string, unknown>} */ (json);
  const draft = Array.isArray(doc.draft_state) ? doc.draft_state : [];
  const pre = doc.pre_draft_rosters;
  const minors = doc.minors;
  const taxi = doc.taxi;

  const badAuctionSalary = draft.filter((p) => {
    const paid = /** @type {{ paid?: unknown }} */ (p).paid;
    return paid == null || paid === 0 || !Number.isFinite(Number(paid)) || Number(paid) <= 0;
  });

  const sorted = [...draft].sort(
    (a, b) =>
      (/** @type {{ pick_number?: number }} */ (a).pick_number ?? 0) -
      (/** @type {{ pick_number?: number }} */ (b).pick_number ?? 0),
  );

  return {
    checkpointName: meta.checkpointName ?? String(doc.checkpoint ?? "?"),
    filePath: meta.filePath ?? "?",
    draftStateLength: draft.length,
    keeperCount: countPlayersInSections(pre),
    minorsCount: countPlayersInSections(minors),
    taxiCount: countPlayersInSections(taxi),
    totalRosterEntries:
      countPlayersInSections(pre) +
      countPlayersInSections(minors) +
      countPlayersInSections(taxi) +
      draft.length,
    auctionDraftEntries: draft.length,
    auctionPicksWithMissingOrZeroSalary: badAuctionSalary.length,
    firstFiveDraftPicks: sorted.slice(0, 5).map(pickSummary),
    lastFiveDraftPicks: sorted.slice(-5).map(pickSummary),
  };
}

/** @param {ReturnType<typeof analyzeCheckpointJson>} report */
export function formatCheckpointReport(report) {
  const lines = [
    `── ${report.checkpointName} ──`,
    `file: ${report.filePath}`,
    `draft_state.length: ${report.draftStateLength}`,
    `keepers: ${report.keeperCount}`,
    `minors: ${report.minorsCount}`,
    `taxi: ${report.taxiCount}`,
    `total roster entries (keepers+minors+taxi+auction): ${report.totalRosterEntries}`,
    `auction draft entries: ${report.auctionDraftEntries}`,
    `auction picks with missing/null/0 salary: ${report.auctionPicksWithMissingOrZeroSalary}`,
    "first 5 draft picks:",
    ...report.firstFiveDraftPicks.map(
      (p) =>
        `  #${p.pick} ${p.player} → ${p.team} $${p.salary}`,
    ),
    "last 5 draft picks:",
    ...report.lastFiveDraftPicks.map(
      (p) =>
        `  #${p.pick} ${p.player} → ${p.team} $${p.salary}`,
    ),
  ];
  return lines.join("\n");
}
