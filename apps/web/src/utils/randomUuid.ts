/**
 * UUID v4 for client-side IDs. Prefer `crypto.randomUUID` when defined (common on HTTPS).
 * On non-secure origins (e.g. S3 website `http://`), `randomUUID` is often missing — use
 * `getRandomValues` instead (still available for UUID generation in modern browsers).
 */
export function createClientUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* some engines throw in restricted contexts */
    }
  }
  if (typeof c?.getRandomValues !== "function") {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2, 14)}`;
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
