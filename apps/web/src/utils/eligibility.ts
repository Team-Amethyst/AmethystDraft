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