/**
 * Split `checkpoint-display-overrides.json` into keeper name map vs draft pick / roster extras.
 * Keeper keys are any top-level entry except reserved keys.
 */

const RESERVED = new Set(["draft_picks", "extra_roster_entries"]);

/**
 * @param {Record<string, unknown>} raw
 * @returns {{ keeperMap: Record<string, unknown>; draftPicksByPick: Record<string, { player_id?: string }>; extraRosterEntries: unknown[] }}
 */
export function partitionCheckpointOverrides(raw) {
  if (!raw || typeof raw !== "object") {
    return { keeperMap: {}, draftPicksByPick: {}, extraRosterEntries: [] };
  }

  /** @type {Record<string, unknown>} */
  const keeperMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (RESERVED.has(k)) continue;
    keeperMap[k] = v;
  }

  const dp = raw.draft_picks;
  /** @type {Record<string, { player_id?: string }>} */
  const draftPicksByPick =
    dp && typeof dp === "object" && !Array.isArray(dp) ?
      /** @type {Record<string, { player_id?: string }>} */ (dp)
    : {};

  const ex = raw.extra_roster_entries;
  const extraRosterEntries = Array.isArray(ex) ? ex : [];

  return { keeperMap, draftPicksByPick, extraRosterEntries };
}
