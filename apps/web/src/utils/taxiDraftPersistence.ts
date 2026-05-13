import type { TaxiDraftState, TaxiRosterEntry } from "../types/taxiDraft";

export async function saveTaxiDraftOrder(
  leagueId: string,
  taxiDraftOrder: string[],
): Promise<void> {
  const response = await fetch(`/api/leagues/${leagueId}/taxi-draft-order`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taxiDraftOrder }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save taxi draft order: ${response.statusText}`);
  }
}

export async function saveTaxiRosters(
  leagueId: string,
  taxiRosters: Record<string, TaxiRosterEntry[]>,
): Promise<void> {
  const response = await fetch(`/api/leagues/${leagueId}/taxi-rosters`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taxiRosters }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save taxi rosters: ${response.statusText}`);
  }
}

export async function loadTaxiDraftState(
  leagueId: string,
): Promise<TaxiDraftState | null> {
  try {
    const response = await fetch(`/api/leagues/${leagueId}`);
    if (!response.ok) {
      throw new Error(`Failed to load league: ${response.statusText}`);
    }
    const league = await response.json();
    return {
      taxiDraftOrder: league.taxiDraftOrder || [],
      taxiRosters: league.taxiRosters || {},
    };
  } catch {
    return null;
  }
}

// Legacy localStorage functions for backward compatibility
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

export function loadTaxiDraftStateLegacy(
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
