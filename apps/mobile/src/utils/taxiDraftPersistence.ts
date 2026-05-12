import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TaxiDraftState } from "../types/taxiDraft";

export function taxiDraftStorageKey(leagueId: string): string {
  return `amethyst-taxi-draft-${leagueId}`;
}

export async function saveTaxiDraftState(
  leagueId: string,
  state: TaxiDraftState,
): Promise<void> {
  if (!leagueId) return;

  try {
    await AsyncStorage.setItem(taxiDraftStorageKey(leagueId), JSON.stringify(state));
  } catch {
    // non-fatal
  }
}

export async function loadTaxiDraftState(
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

export async function clearTaxiDraftState(leagueId: string): Promise<void> {
  if (!leagueId) return;

  try {
    await AsyncStorage.removeItem(taxiDraftStorageKey(leagueId));
  } catch {
    // noop
  }
}
