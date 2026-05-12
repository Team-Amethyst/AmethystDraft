import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MockDraftState } from "../domain/mockDraftState";

export function mockDraftStorageKey(leagueId: string): string {
  return `amethyst-mobile-mock-draft-${leagueId}`;
}

export async function saveMockDraftState(
  leagueId: string,
  state: MockDraftState,
): Promise<void> {
  if (!leagueId) return;

  try {
    await AsyncStorage.setItem(mockDraftStorageKey(leagueId), JSON.stringify(state));
  } catch {
    // non-fatal
  }
}

export async function loadMockDraftState(
  leagueId: string,
): Promise<MockDraftState | null> {
  if (!leagueId) return null;

  try {
    const raw = await AsyncStorage.getItem(mockDraftStorageKey(leagueId));
    return raw ? (JSON.parse(raw) as MockDraftState) : null;
  } catch {
    return null;
  }
}

export async function clearMockDraftState(leagueId: string): Promise<void> {
  if (!leagueId) return;

  try {
    await AsyncStorage.removeItem(mockDraftStorageKey(leagueId));
  } catch {
    // noop
  }
}