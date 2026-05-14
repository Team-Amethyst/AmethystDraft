import type { TaxiDraftState, TaxiRosterEntry } from "../types/taxiDraft";
import { authHeaders, requestJson, requestVoid } from "../api/client";

export async function saveTaxiDraftOrder(
  leagueId: string,
  taxiDraftOrder: string[],
  token?: string,
): Promise<void> {
  await requestVoid(
    `/api/leagues/${leagueId}/taxi-draft-order`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ taxiDraftOrder }),
    },
    "Failed to save taxi draft order",
  );
}

export async function saveTaxiRosters(
  leagueId: string,
  taxiRosters: Record<string, TaxiRosterEntry[]>,
  token?: string,
): Promise<void> {
  await requestVoid(
    `/api/leagues/${leagueId}/taxi-rosters`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ taxiRosters }),
    },
    "Failed to save taxi rosters",
  );
}

export async function loadTaxiDraftState(
  leagueId: string,
  token?: string,
): Promise<TaxiDraftState | null> {
  try {
    const league = await requestJson<
      | {
          taxiDraftOrder?: string[];
          taxiRosters?: Record<string, TaxiRosterEntry[]>;
        }
      | null
    >(
      `/api/leagues/${leagueId}`,
      {
        method: "GET",
        headers: authHeaders(token),
      },
      "Failed to load league",
    );

    if (!league) {
      return null;
    }

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
