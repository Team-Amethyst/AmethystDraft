const LEGACY_POSITION_TARGETS_KEY = "amethyst-position-targets";

export function positionTargetsStorageKey(
  leagueId: string | null | undefined,
): string {
  const id = leagueId?.trim();
  if (!id) return LEGACY_POSITION_TARGETS_KEY;
  return `${LEGACY_POSITION_TARGETS_KEY}:${id}`;
}

export function readPositionTargetsFromStorage(
  leagueId: string | null | undefined,
): Record<string, number> {
  const key = positionTargetsStorageKey(leagueId);
  const legacyKey = LEGACY_POSITION_TARGETS_KEY;
  const candidates = key === legacyKey ? [legacyKey] : [key, legacyKey];
  for (const k of candidates) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, number> = {};
      for (const [pos, value] of Object.entries(parsed)) {
        const n = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(n)) continue;
        out[pos] = Math.round(n);
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      // ignore malformed storage values
    }
  }
  return {};
}

export function writePositionTargetsToStorage(
  leagueId: string | null | undefined,
  targets: Record<string, number>,
): void {
  const key = positionTargetsStorageKey(leagueId);
  localStorage.setItem(key, JSON.stringify(targets));
}

export function clearPositionTargetsStorage(
  leagueId: string | null | undefined,
): void {
  const key = positionTargetsStorageKey(leagueId);
  localStorage.removeItem(key);
}
