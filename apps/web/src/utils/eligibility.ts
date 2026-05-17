const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);
const OUTFIELD_POSITIONS = new Set(["OF", "LF", "CF", "RF"]);

function splitPositionTokens(positions: string | string[]): string[] {
  const values = Array.isArray(positions) ? positions : [positions];
  return values
    .flatMap((value) => value.split(/[/,|]/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function canonicalizePosition(position: string): string[] {
  const normalized = position.toUpperCase().replace(/\s+/g, "");
  switch (normalized) {
    case "LF":
    case "CF":
    case "RF":
      return ["OF"];
    case "UTL":
    case "UTIL":
      return ["DH"];
    case "TWP":
      return ["SP", "DH"];
    default:
      return [normalized];
  }
}

export function normalizePlayerPositions(
  positions?: string[] | string,
  fallback?: string,
): string[] {
  const source =
    positions !== undefined &&
    (!Array.isArray(positions) || positions.length > 0)
      ? positions
      : fallback;

  if (!source) return [];

  return [...new Set(splitPositionTokens(source).flatMap(canonicalizePosition))];
}

export function isPitcherPosition(position: string): boolean {
  return PITCHER_POSITIONS.has(position.toUpperCase());
}

export function hasPitcherEligibility(
  positions?: string[] | string,
  fallback?: string,
): boolean {
  return normalizePlayerPositions(positions, fallback).some(isPitcherPosition);
}

export function slotAllowsPosition(slot: string, position: string): boolean {
  const normalizedSlot = slot.toUpperCase().replace(/\s+/g, "");
  const normalizedPosition = canonicalizePosition(position)[0] ?? position;

  if (normalizedSlot === normalizedPosition) return true;
  if (normalizedSlot === "BN" || normalizedSlot === "BENCH") return true;
  if (normalizedSlot === "UTIL") return !isPitcherPosition(normalizedPosition);
  if (normalizedSlot === "MI")
    return ["2B", "SS", "IF"].includes(normalizedPosition);
  if (normalizedSlot === "CI")
    return ["1B", "3B", "IF"].includes(normalizedPosition);
  if (normalizedSlot === "OF") return OUTFIELD_POSITIONS.has(normalizedPosition);
  if (normalizedSlot === "P") return isPitcherPosition(normalizedPosition);
  if (normalizedSlot === "SP")
    return ["SP", "P"].includes(normalizedPosition);
  if (normalizedSlot === "RP")
    return ["RP", "P"].includes(normalizedPosition);

  return false;
}

export function getEligibleSlotsForPositions(
  positions: string[] | string | undefined,
  slots: string[],
  fallback?: string,
): string[] {
  const normalizedPositions = normalizePlayerPositions(positions, fallback);
  if (normalizedPositions.length === 0) return [];

  return slots.filter((slot) =>
    normalizedPositions.some((position) => slotAllowsPosition(slot, position)),
  );
}

export function getEligibleSlotsForPosition(
  position: string,
  slots: string[],
): string[] {
  return getEligibleSlotsForPositions([position], slots);
}

const STRIP_FROM_CATALOG_BADGES = new Set(["DH", "UTIL", "BN", "BENCH"]);

/** Roster slots every player can use — omit from draft-context position chips. */
const UNIVERSAL_DRAFT_DISPLAY_SLOTS = new Set(["BN", "BENCH", "UTIL"]);

/**
 * Roster slots this player can fill in this league, in roster definition order,
 * excluding universal slots (UTIL / bench) and DH (not a draft slot in typical fantasy setups).
 */
/**
 * Roster slots to show in Command Center left “market” tabs for the selected player.
 * Uses {@link draftDisplaySlotsForPlayer} (no DH / UTIL / bench) and collapses SP+RP into one P tab.
 */
export function commandCenterMarketSlotsForPlayer(
  player: { positions?: string[]; position: string },
  rosterSlotKeys: readonly string[],
): string[] {
  if (rosterSlotKeys.length === 0) return [];
  return collapsePitcherPositionChipsForDisplay(
    draftDisplaySlotsForPlayer(
      player.positions,
      [...rosterSlotKeys],
      player.position,
    ),
  );
}

export function draftDisplaySlotsForPlayer(
  positions: string[] | string | undefined,
  rosterSlotKeys: string[],
  fallback?: string,
): string[] {
  if (rosterSlotKeys.length === 0) return [];

  const eligible = getEligibleSlotsForPositions(
    positions,
    rosterSlotKeys,
    fallback,
  );
  const eligibleUpper = new Set(
    eligible.map((s) => s.toUpperCase().replace(/\s+/g, "")),
  );
  const out: string[] = [];
  const added = new Set<string>();

  for (const slot of rosterSlotKeys) {
    const u = slot.toUpperCase().replace(/\s+/g, "");
    if (UNIVERSAL_DRAFT_DISPLAY_SLOTS.has(u)) continue;
    if (u === "DH") continue;
    if (!eligibleUpper.has(u) || added.has(u)) continue;
    added.add(u);
    out.push(slot);
  }

  return out;
}

/**
 * Every roster slot this player may be drafted into for this league, in roster
 * definition order (includes UTIL / bench when eligible). Ignores filled slots.
 */
export function playerDraftableRosterSlots(
  player: { positions?: string[]; position: string },
  rosterSlotKeys: readonly string[],
): string[] {
  if (rosterSlotKeys.length === 0) return [];

  const eligible = getEligibleSlotsForPositions(
    player.positions,
    [...rosterSlotKeys],
    player.position,
  );
  const eligibleUpper = new Set(
    eligible.map((s) => s.toUpperCase().replace(/\s+/g, "")),
  );
  const out: string[] = [];
  const added = new Set<string>();

  for (const slot of rosterSlotKeys) {
    const u = slot.toUpperCase().replace(/\s+/g, "");
    if (!eligibleUpper.has(u) || added.has(u)) continue;
    added.add(u);
    out.push(slot);
  }

  return out;
}

/** True fantasy “scan line” positions (not MI / CI / UTIL roster buckets). */
const PRIMARY_FANTASY_ORDER = [
  "C",
  "1B",
  "2B",
  "SS",
  "3B",
  "IF",
  "OF",
] as const;

/** Roster slots on the secondary “Slots” line (draft fit). */
const SLOT_ELIGIBILITY_U = new Set(["MI", "CI", "UTIL", "SP", "RP", "P"]);

/** Allowed tokens from {@link playerIdentityPositionPresentation} `primaryTags` (DH handled separately). */
const RESEARCH_TABLE_PRIMARY_FROM_PRES = new Set([
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "OF",
  "P",
]);

export type PlayerIdentityPositionPresentation = {
  /** C, 1B, …, OF, P — fantasy positions beside the player name. */
  primaryTags: string[];
  /** Every roster slot this player may be drafted into (league order). */
  draftableSlots: string[];
  /** @deprecated Prefer {@link draftableSlots}. MI / CI / UTIL / SP / RP subset. */
  slotEligibilityTags: string[];
  /** @deprecated Not shown in product UI. */
  roleLabel: string | null;
  /** @deprecated Not shown in product UI. */
  roleNote: string | null;
};

function sortPrimaryHittingFromNormalized(hitters: string[]): string[] {
  const upper = new Set(hitters.map((h) => h.toUpperCase().replace(/\s+/g, "")));
  const out: string[] = [];
  for (const tag of PRIMARY_FANTASY_ORDER) {
    if (tag === "OF") {
      if (
        upper.has("OF") ||
        upper.has("LF") ||
        upper.has("CF") ||
        upper.has("RF")
      ) {
        if (!out.includes("OF")) out.push("OF");
      }
    } else if (upper.has(tag)) {
      out.push(tag);
    }
  }
  return out;
}

function slotEligibilityInRosterOrder(
  positions: string[] | string | undefined,
  rosterSlotKeys: string[],
  fallback?: string,
): string[] {
  if (rosterSlotKeys.length === 0) return [];
  const eligible = getEligibleSlotsForPositions(
    positions,
    rosterSlotKeys,
    fallback,
  );
  const eligibleU = new Set(
    eligible.map((s) => s.toUpperCase().replace(/\s+/g, "")),
  );
  const out: string[] = [];
  const added = new Set<string>();
  for (const key of rosterSlotKeys) {
    const u = key.toUpperCase().replace(/\s+/g, "");
    if (!SLOT_ELIGIBILITY_U.has(u)) continue;
    if (u === "BN" || u === "BENCH") continue;
    if (!eligibleU.has(u)) continue;
    if (added.has(u)) continue;
    added.add(u);
    out.push(key);
  }
  return dedupePitcherSlotLine(out);
}

/** When SP or RP appears, drop redundant generic `P` from the slot line. */
function dedupePitcherSlotLine(slots: readonly string[]): string[] {
  const u = slots.map((s) => s.toUpperCase().replace(/\s+/g, ""));
  const hasSpOrRp = u.some((x) => x === "SP" || x === "RP");
  if (!hasSpOrRp) return [...slots];
  return slots.filter((s) => s.toUpperCase().replace(/\s+/g, "") !== "P");
}

/**
 * Splits catalog **positions** (primary scan line) from **roster slot eligibility**
 * (MI, CI, UTIL, SP, RP, P) for identity / name-adjacent UI.
 */
export function playerIdentityPositionPresentation(
  player: { positions?: string[]; position: string },
  rosterSlotKeys?: readonly string[] | null,
): PlayerIdentityPositionPresentation {
  const keys = rosterSlotKeys?.length ? [...rosterSlotKeys] : null;
  const norm = normalizePlayerPositions(player.positions, player.position);

  const hitterTokens = norm.filter((p) => !isPitcherPosition(p) && p !== "DH");
  const primaryHitters = sortPrimaryHittingFromNormalized(hitterTokens);
  const hasPitcher = norm.some(isPitcherPosition);
  const primaryTags = collapsePitcherPositionChipsForDisplay([
    ...primaryHitters,
    ...(hasPitcher ? (["P"] as const) : []),
  ]);

  let slotEligibilityTags: string[] = [];
  let draftableSlots: string[] = [];
  if (keys && keys.length > 0) {
    slotEligibilityTags = slotEligibilityInRosterOrder(
      player.positions,
      keys,
      player.position,
    );
    draftableSlots = playerDraftableRosterSlots(player, keys);
  }

  if (primaryTags.length === 0 && !hasPitcher) {
    const fallback = collapsePitcherPositionChipsForDisplay(
      norm.filter((p) => !STRIP_FROM_CATALOG_BADGES.has(p)),
    );
    return {
      primaryTags: fallback,
      draftableSlots,
      slotEligibilityTags,
      roleLabel: null,
      roleNote: null,
    };
  }

  return {
    primaryTags,
    draftableSlots,
    slotEligibilityTags,
    roleLabel: null,
    roleNote: null,
  };
}

/** @deprecated Use {@link playerIdentityPositionPresentation} */
export type PlayerPositionBadgeSplit = {
  primary: string[];
  meta: string[];
  roleNote: string | null;
};

/** @deprecated Use {@link playerIdentityPositionPresentation} */
export function playerDisplayPositionBadgeSplit(
  player: { positions?: string[]; position: string },
  rosterSlotKeys?: readonly string[] | null,
): PlayerPositionBadgeSplit {
  const p = playerIdentityPositionPresentation(player, rosterSlotKeys);
  return {
    primary: p.primaryTags,
    meta: p.slotEligibilityTags,
    roleNote: p.roleNote,
  };
}

const PITCHER_CHIP_UPPER = new Set(["SP", "RP", "P"]);

/**
 * Collapse SP / RP / generic P into one “P” chip (covers starter and reliever buckets).
 */
export function collapsePitcherPositionChipsForDisplay(
  slots: readonly string[],
): string[] {
  const out: string[] = [];
  let pitcherEmitted = false;
  for (const slot of slots) {
    const u = slot.toUpperCase().replace(/\s+/g, "");
    if (PITCHER_CHIP_UPPER.has(u)) {
      if (!pitcherEmitted) {
        pitcherEmitted = true;
        out.push("P");
      }
    } else {
      out.push(slot);
    }
  }
  return out;
}

/**
 * Primary fantasy position chips only (C, 1B, …, OF, P). MI / CI / UTIL / SP / RP live on
 * {@link playerDisplaySlotEligibilityBadges}.
 */
export function playerDisplayPositionBadges(
  player: { positions?: string[]; position: string },
  rosterSlotKeys?: readonly string[] | null,
): string[] {
  return playerIdentityPositionPresentation(player, rosterSlotKeys).primaryTags;
}

/** Roster slot eligibility for a secondary “Slots” line (MI, CI, UTIL, SP, RP, P). */
export function playerDisplaySlotEligibilityBadges(
  player: { positions?: string[]; position: string },
  rosterSlotKeys?: readonly string[] | null,
): string[] {
  return playerIdentityPositionPresentation(player, rosterSlotKeys)
    .slotEligibilityTags;
}

/**
 * Primary fantasy positions for the dense Research `PlayerTable` POS column (no slot line).
 * Hitters: C, 1B, 2B, 3B, SS, OF; pitchers: P; multi joined as `SS / 3B / OF`.
 * DH appears only when the league roster includes a DH slot.
 */
export function researchTablePrimaryPositionParts(
  player: { positions?: string[]; position: string },
  rosterSlotKeys?: readonly string[] | null,
): string[] {
  const keys = rosterSlotKeys?.length ? [...rosterSlotKeys] : null;
  const pres = playerIdentityPositionPresentation(player, rosterSlotKeys);
  const norm = normalizePlayerPositions(player.positions, player.position);
  const leagueHasDhSlot =
    keys?.some((k) => k.toUpperCase().replace(/\s+/g, "") === "DH") ?? false;
  const hasDhCatalog = norm.some((p) => p === "DH");
  const anyPitcher = norm.some(isPitcherPosition);

  const out = pres.primaryTags.filter((t) =>
    RESEARCH_TABLE_PRIMARY_FROM_PRES.has(t.toUpperCase().replace(/\s+/g, "")),
  );

  if (
    leagueHasDhSlot &&
    hasDhCatalog &&
    !anyPitcher &&
    !out.some((t) => t.toUpperCase().replace(/\s+/g, "") === "DH")
  ) {
    out.push("DH");
  }

  return out;
}