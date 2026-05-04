import type { MockDraftState } from "../domain/mockDraftState";

export function mockDraftStorageKey(leagueId: string): string {
  return `amethyst-mock-draft-${leagueId}`;
}

export function saveMockDraftState(leagueId: string, state: MockDraftState): void {
  if (!leagueId) return;
  try {
    localStorage.setItem(mockDraftStorageKey(leagueId), JSON.stringify(state));
  } catch {
    // storage full — non-fatal
  }
}

export function loadMockDraftState(leagueId: string): MockDraftState | null {
  if (!leagueId) return null;
  try {
    const raw = localStorage.getItem(mockDraftStorageKey(leagueId));
    return raw ? (JSON.parse(raw) as MockDraftState) : null;
  } catch {
    return null;
  }
}

export function clearMockDraftState(leagueId: string): void {
  if (!leagueId) return;
  try {
    localStorage.removeItem(mockDraftStorageKey(leagueId));
  } catch {
    /* noop */
  }
}
