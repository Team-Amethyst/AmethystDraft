/**
 * Resolve workbook display names to MLB ids for fixture generation.
 * Minors/taxi use deterministic synthetic ids when 40-man lookup fails (never silent drop).
 */

import { resolveAbbreviatedKeeper } from "./checkpointMlbResolver.mjs";

let syntheticUnresolvedSeq = 9_900_000;

/** Reset between test cases for stable synthetic ids. */
export function resetSyntheticUnresolvedSeq(n = 9_900_000) {
  syntheticUnresolvedSeq = n;
}

/**
 * @param {readonly { player_id: string; name: string; abbr: string }[]} entries
 * @param {string} displayName
 * @param {Record<string, { player_id?: string; name?: string; team?: string }>} overrides
 * @param {string} context e.g. minors | taxi | keeper
 * @param {string[]} warnings
 * @param {{ allowSynthetic?: boolean }} [opts]
 */
export function resolveFixturePlayerDisplay(
  entries,
  displayName,
  overrides,
  context,
  warnings,
  opts = {},
) {
  const allowSynthetic = opts.allowSynthetic !== false;
  const key = String(displayName).trim();
  if (!key) throw new Error(`Empty player name (${context})`);

  const forced = overrides[key];
  if (forced?.player_id) {
    const hit = entries.find((e) => String(e.player_id) === String(forced.player_id));
    if (hit) {
      return {
        player_id: hit.player_id,
        name: hit.name,
        team: hit.abbr,
        unresolved: false,
      };
    }
    return {
      player_id: String(forced.player_id),
      name: typeof forced.name === "string" ? forced.name : key,
      team: typeof forced.team === "string" ? forced.team : "UNK",
      unresolved: false,
    };
  }

  try {
    const r = resolveAbbreviatedKeeper(entries, key, overrides);
    return { ...r, unresolved: false };
  } catch (e) {
    if (!allowSynthetic) throw e;
    syntheticUnresolvedSeq += 1;
    const player_id = `fixture_unresolved_${syntheticUnresolvedSeq}`;
    warnings.push(
      `UNRESOLVED|context=${context}|name=${JSON.stringify(key)}|player_id=${player_id}|detail=${e instanceof Error ? e.message : String(e)}`,
    );
    return { player_id, name: key, team: "UNK", unresolved: true };
  }
}
