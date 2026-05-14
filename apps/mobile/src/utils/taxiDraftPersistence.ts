import AsyncStorage from "@react-native-async-storage/async-storage";
import { authHeaders, requestJson, requestVoid } from "../api/client";
import type { TaxiDraftState, TaxiRosters } from "../types/taxiDraft";

type LeagueTaxiStateResponse = {
  taxiDraftOrder?: string[];
  taxiRosters?: TaxiRosters;
};

export function taxiDraftStorageKey(leagueId: string): string {
  return `amethyst-taxi-draft-${leagueId}`;
}

async function loadLocalTaxiDraftState(
  leagueId: string,
): Promise<TaxiDraftState | null> {
  if (!leagueId) return null;

  try {
    const raw = await AsyncStorage.getItem(taxiDraftStorageKey(leagueId));
    return raw ? (JSON.parse(raw) as TaxiDraftState) : null;
  } catch {
    return null;
  }
}

export async function saveTaxiDraftState(
  leagueId: string,
  state: TaxiDraftState,
): Promise<void> {
  if (!leagueId) return;

  try {
    await AsyncStorage.setItem(
      taxiDraftStorageKey(leagueId),
      JSON.stringify(state),
    );
  } catch {
    // non-fatal
  }
}

export async function loadTaxiDraftState(
  leagueId: string,
  token?: string | null,
): Promise<TaxiDraftState | null> {
  if (!leagueId) return null;

  if (token?.trim()) {
    try {
      const league = await requestJson<LeagueTaxiStateResponse>(
        `/api/leagues/${leagueId}`,
        {
          headers: authHeaders(token),
        },
        "Failed to load taxi draft state",
      );

      const state = {
        taxiDraftOrder: league.taxiDraftOrder ?? [],
        taxiRosters: league.taxiRosters ?? {},
      };

      await saveTaxiDraftState(leagueId, state);
      return state;
    } catch {
      // fall back to local storage
    }
  }

  return loadLocalTaxiDraftState(leagueId);
}

export async function saveTaxiDraftOrder(
  leagueId: string,
  taxiDraftOrder: string[],
  token?: string | null,
): Promise<void> {
  if (!leagueId) return;

  const current = await loadLocalTaxiDraftState(leagueId);

  await saveTaxiDraftState(leagueId, {
    taxiDraftOrder,
    taxiRosters: current?.taxiRosters ?? {},
  });

  if (!token?.trim()) return;

  try {
    await requestVoid(
      `/api/leagues/${leagueId}/taxi-draft-order`,
      {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ taxiDraftOrder }),
      },
      "Failed to save taxi draft order",
    );
  } catch {
    // local save already succeeded
  }
}

export async function saveTaxiRosters(
  leagueId: string,
  taxiRosters: TaxiRosters,
  token?: string | null,
): Promise<void> {
  if (!leagueId) return;

  const current = await loadLocalTaxiDraftState(leagueId);

  await saveTaxiDraftState(leagueId, {
    taxiDraftOrder: current?.taxiDraftOrder ?? [],
    taxiRosters,
  });

  if (!token?.trim()) return;

  try {
    await requestVoid(
      `/api/leagues/${leagueId}/taxi-rosters`,
      {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ taxiRosters }),
      },
      "Failed to save taxi rosters",
    );
  } catch {
    // local save already succeeded
  }
}

export async function clearTaxiDraftState(leagueId: string): Promise<void> {
  if (!leagueId) return;

  try {
    await AsyncStorage.removeItem(taxiDraftStorageKey(leagueId));
  } catch {
    // noop
  }
}