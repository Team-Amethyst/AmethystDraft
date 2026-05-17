/**
 * Keeper / draft positional accuracy for workbook-driven checkpoints.
 */

/** @typedef {{ player_id: string; name: string; abbr: string; raw_position?: string; fantasy_pitch?: "SP"|"RP"|null }} FortyManLike */

/**
 * Canonical league roster-slot labels (matches `test-fixtures/player-api/league.base.json`).
 * @param {string} raw
 */
export function normalizeWorkbookRosterSlotLabel(raw) {
  const z = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!z) return "";
  /** Ambiguous workbook slot glyph */
  if (z === "?") return "BN";
  /** Workbook utility row */
  if (z === "U" || z === "UT" || z === "UTILITY" || z === "DH") return "UTIL";
  /** Generic pitcher column — classify later using `fantasy_pitch` */
  if (z === "P" || z === "PITCHER") return "P";
  const allowed = new Set([
    "C",
    "1B",
    "2B",
    "SS",
    "3B",
    "MI",
    "CI",
    "OF",
    "LF",
    "CF",
    "RF",
    "IF",
    "UTIL",
    "SP",
    "RP",
    "BN",
  ]);
  return allowed.has(z) ? z : z;
}

/**
 * @param {FortyManLike | null | undefined} entry
 * @returns {string[]}
 */
export function fantasyPositionsFromForty(entry) {
  if (!entry) return [];
  const raw = String(entry.raw_position ?? "")
    .trim()
    .toUpperCase();

  if (raw === "P") {
    const role =
      entry.fantasy_pitch === "RP" ? "RP"
      : entry.fantasy_pitch === "SP" ? "SP"
      : /** undecided */ "SP";
    return [role];
  }

  if (!raw) return [];

  if (raw === "LF" || raw === "CF" || raw === "RF") return [...new Set([raw, "OF"])];

  switch (raw) {
    case "IF":
      return ["IF"];
    case "DH":
      return ["UTIL"];
    default:
      return [raw];
  }
}

/** @param {string[] | null | undefined} tokens */
export function normalizeSheetPositionTokens(tokens) {
  /** @type {Set<string>} */
  const acc = new Set();

  for (const t of tokens ?? []) {
    const parts = String(t)
      .trim()
      .toUpperCase()
      .split(/[/|,]+/)
      .map((x) => x.trim())
      .filter(Boolean);

    for (const pRaw of parts) {
      if (pRaw === "P") {
        acc.add("P");
        continue;
      }
      acc.add(normalizeWorkbookRosterSlotLabel(pRaw) || pRaw);
    }
  }

  return [...acc];
}

/** @returns {number} */
export function inferredPositionBucketOrder(pos) {
  const order = [
    "C",
    "1B",
    "2B",
    "SS",
    "3B",
    "MI",
    "CI",
    "LF",
    "CF",
    "RF",
    "OF",
    "IF",
    "UTIL",
    "SP",
    "RP",
    "BN",
  ];
  const ix = order.indexOf(pos);
  return ix < 0 ? 99 : ix;
}

/**
 * When API rows lack `positions`, infer from normalized roster slot (Mongo / Engine fallback).
 * @param {string} roster_slot
 */
export function inferredPositionsFromRosterSlotOnly(roster_slot) {
  const s = String(roster_slot ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!s || s === "BN") return ["UTIL"];
  if (s === "UTIL") return ["UTIL"];
  if (s === "MI") return ["MI"];
  if (s === "CI") return ["CI"];
  if (s === "OF") return ["OF"];
  if (["C", "1B", "2B", "SS", "3B"].includes(s)) return [s];
  if (s === "SP" || s === "RP") return [s];
  return ["UTIL"];
}

/**
 * @param {FortyManLike | null | undefined} base
 */
function hitterFortyClone(base) {
  if (!base)
    return /** @type {FortyManLike} */ ({
      player_id: "",
      name: "",
      abbr: "",
      raw_position: "",
      fantasy_pitch: null,
    });
  return {
    player_id: base.player_id,
    name: base.name,
    abbr: base.abbr,
    fantasy_pitch: null,
    raw_position: base.raw_position,
  };
}

/** @param {string[]} hitterPossSorted */
function primaryRosterSlotFromHitPositions(hitterPossSorted) {
  for (const pr of hitterPossSorted) {
    return pr;
  }
  return "UTIL";
}

/**
 * @param {{
 *   workbookSlotRaw: string;
 *   fortyEntry?: FortyManLike | null;
 *   sheetPositions?: string[] | null | undefined;
 * }} opts
 */
export function finalizeCheckpointPlayerPositions(opts) {
  const { workbookSlotRaw, fortyEntry = null, sheetPositions } = opts;

  const sheet = normalizeSheetPositionTokens(sheetPositions);
  const sheetPitchRole =
    sheet.includes("RP") ? "RP"
    : sheet.includes("SP") ? "SP"
    : null;
  const sheetGenericP = sheet.includes("P");

  const rawPos = String(fortyEntry?.raw_position ?? "")
    .trim()
    .toUpperCase();

  const mlbPitcher = rawPos === "P";

  const wbNormPrecheck = normalizeWorkbookRosterSlotLabel(workbookSlotRaw);
  const workbookSaysPitcher = wbNormPrecheck === "P";

  const isPitcher =
    mlbPitcher || workbookSaysPitcher || sheetPitchRole !== null || sheetGenericP;

  if (isPitcher) {
    const role =
      sheetPitchRole === "RP" || sheetPitchRole === "SP" ? sheetPitchRole
      : fortyEntry?.fantasy_pitch === "RP" ? "RP"
      : fortyEntry?.fantasy_pitch === "SP" ? "SP"
      : "SP";

    return { roster_slot: role, positions: [role] };
  }

  /** Hitters: MLB eligibility (+ optional workbook POS splits) */

  /** @type {Set<string>} */
  const hitterPoss = new Set();

  if (fortyEntry && rawPos && rawPos !== "P") {
    for (const pos of fantasyPositionsFromForty(hitterFortyClone(fortyEntry))) {
      hitterPoss.add(pos);
    }
  }

  for (const sTok of sheet) {
    if (sTok === "P" || sTok === "SP" || sTok === "RP") continue;
    hitterPoss.add(sTok);
  }

  const wbNorm = normalizeWorkbookRosterSlotLabel(workbookSlotRaw);
  const wbRaw = String(workbookSlotRaw ?? "").trim().toUpperCase();

  /** @type {string[]} */
  let positions = [...hitterPoss].sort(
    (a, b) =>
      inferredPositionBucketOrder(a) - inferredPositionBucketOrder(b) ||
      a.localeCompare(b),
  );

  let roster_slot_out = "";

  if (wbNorm && wbNorm !== "P") roster_slot_out = wbNorm;
  else if (wbRaw === "U") roster_slot_out = "UTIL";

  if (!roster_slot_out && positions.length)
    roster_slot_out = primaryRosterSlotFromHitPositions(positions);

  if (!roster_slot_out) roster_slot_out = "UTIL";

  if (!positions.length) positions = inferredPositionsFromRosterSlotOnly(roster_slot_out);

  return { roster_slot: roster_slot_out, positions };
}
