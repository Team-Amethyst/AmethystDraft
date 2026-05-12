import type { NewsSignalsResponse } from "./engine";

/** Short TTL so reopening the bell is instant while Engine stays authoritative on refresh. */
const TTL_MS = 45_000;

const store = new Map<string, { data: NewsSignalsResponse; at: number }>();

export function newsSignalsCacheKey(days: number, signalType?: string): string {
  return `${days}\u0000${signalType ?? ""}`;
}

export function readNewsSignalsCache(key: string): NewsSignalsResponse | null {
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return row.data;
}

export function writeNewsSignalsCache(
  key: string,
  data: NewsSignalsResponse,
): void {
  store.set(key, { data, at: Date.now() });
}
