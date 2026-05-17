/**
 * Infer Mongo `positions` for checkpoint/import rows when valuation fixtures omit catalogs.
 */

/**
 * Mirrors workbook normalization (BN for unknown glyphs; DH→UTIL; U→UTIL).
 */
export function normalizeCheckpointRosterSlotLabel(raw: string): string {
  const z = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!z) return "UTIL";
  if (z === "?" || z === "BN") return z === "BN" ? "BN" : "UTIL";
  if (z === "U" || z === "UT" || z === "UTILITY" || z === "DH") return "UTIL";
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
  if (allowed.has(z)) return z;

  /** Unknown positional tag — safest bucket */
  return "UTIL";
}

export function inferredPositionsFromRosterSlot(
  rosterSlot: string | undefined | null,
): string[] {
  const z = normalizeCheckpointRosterSlotLabel(String(rosterSlot ?? ""));
  if (!z) return ["UTIL"];
  if (z === "BN") return ["UTIL"];
  if (z === "UTIL") return ["UTIL"];
  if (z === "MI") return ["MI"];
  if (z === "CI") return ["CI"];
  if (z === "OF") return ["OF"];
  if (["C", "1B", "2B", "SS", "3B"].includes(z)) return [z];

  if (z === "LF" || z === "CF" || z === "RF")
    /** Match fixture expansion for outfield scarcity */
    return [...new Set([z, "OF"])];

  if (z === "IF") return ["IF"];

  if (z === "SP" || z === "RP") return [z];
  /** Generic workbook pitcher column → starter default */
  if (z === "P") return ["SP"];

  return ["UTIL"];
}

export function inferMongoPositionsFromCheckpointPick(pl: {
  positions?: string[] | null | undefined;
  position?: string | undefined;
  roster_slot?: string | undefined;
}): string[] {
  const pos = Array.isArray(pl.positions)
    ? pl.positions.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (pos.length > 0) return [...pos];

  const one = String(pl.position ?? "").trim();
  if (one) return [one.toUpperCase()];

  const slot = pl.roster_slot?.trim();
  return inferredPositionsFromRosterSlot(slot ?? "");
}
