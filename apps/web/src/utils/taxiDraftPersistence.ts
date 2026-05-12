import type { TaxiDraftState } from "../types/taxiDraft";

export function taxiDraftStorageKey(leagueId: string): string {
  return `amethyst-taxi-draft-${leagueId}`;
}

export function saveTaxiDraftState(
  leagueId: string,
  state: TaxiDraftState,
): void {
  if (!leagueId) return;
  try {
    localStorage.setItem(taxiDraftStorageKey(leagueId), JSON.stringify(state));
  } catch {
    // localStorage may be unavailable or full; non-fatal
  }
}

export function loadTaxiDraftState(
  leagueId: string,
): TaxiDraftState | null {
  if (!leagueId) return null;
  try {
    const raw = localStorage.getItem(taxiDraftStorageKey(leagueId));
    return raw ? (JSON.parse(raw) as TaxiDraftState) : null;
  } catch {
    return null;
  }
}

export function clearTaxiDraftState(leagueId: string): void {
  if (!leagueId) return;
  try {
    localStorage.removeItem(taxiDraftStorageKey(leagueId));
  } catch {
    /* noop */
  }
}
