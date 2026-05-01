export function myDraftLeagueKey(
  leagueId: string | undefined,
  suffix: string,
): string {
  return `amethyst-mydraft-${leagueId ?? "global"}-${suffix}`;
}

export function loadJsonFromStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJsonToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage write errors */
  }
}
