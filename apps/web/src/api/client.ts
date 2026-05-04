/** AmethystDraft API (BFF) origin — not the Engine URL; Engine calls stay server-side in apps/api. */
const ENV_API_BASE = import.meta.env.VITE_API_URL?.trim() || "";
const LOCAL_API_FALLBACKS = ["http://localhost:3000", "http://localhost:3002"];

let resolvedApiBase: string | null = null;
let resolvingApiBase: Promise<string> | null = null;

type ValidationErr = { field?: string; message?: string };

type ErrorShape = {
  message?: string;
  errors?: ValidationErr[];
  error?: {
    code?: string;
    message?: string;
  };
};

function messageFromEngineValidation(errors: ValidationErr[]): string {
  return errors
    .map((e) => {
      const f = e.field?.trim() || "request";
      const m = e.message?.trim() || "invalid";
      return `${f}: ${m}`;
    })
    .join("; ");
}

export function buildApiUrl(path: string): string {
  const base =
    resolvedApiBase ??
    (ENV_API_BASE || LOCAL_API_FALLBACKS[0]);
  return `${base}${path}`;
}

export function authHeaders(token?: string): Record<string, string> {
  const trimmed = token?.trim();
  if (!trimmed) {
    return {
      "Content-Type": "application/json",
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${trimmed}`,
  };
}

export function requireAuthHeaders(token?: string): Record<string, string> {
  const trimmed = token?.trim();
  if (!trimmed) {
    throw new Error("Authentication required. Please sign in again.");
  }
  return authHeaders(trimmed);
}

async function parseApiError(
  res: globalThis.Response,
  fallbackMessage: string,
): Promise<never> {
  let message = fallbackMessage;
  try {
    const data = (await res.json()) as ErrorShape;
    if (res.status === 429) {
      message =
        data.error?.message ??
        data.message ??
        "Too many requests. Please wait a moment and try again.";
    } else if (Array.isArray(data.errors) && data.errors.length > 0) {
      message = messageFromEngineValidation(data.errors);
    } else {
      message = data.error?.message ?? data.message ?? fallbackMessage;
    }
  } catch {
    // ignore parse failures and fall back to default message
  }
  throw new Error(message);
}

function apiBaseCandidates(): string[] {
  const ordered = ENV_API_BASE
    ? [ENV_API_BASE, ...LOCAL_API_FALLBACKS]
    : [...LOCAL_API_FALLBACKS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const base of ordered) {
    const normalized = base.replace(/\/$/, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

async function probeApiBase(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; message?: string };
    const msg = data.message?.toLowerCase() ?? "";
    // Only accept health responses from this API, not any random service.
    return data.status === "ok" && msg.includes("draftroom api");
  } catch {
    return false;
  }
}

async function resolveApiBase(): Promise<string> {
  if (resolvedApiBase) return resolvedApiBase;
  if (resolvingApiBase) return resolvingApiBase;

  resolvingApiBase = (async () => {
    const candidates = apiBaseCandidates();
    for (const base of candidates) {
      if (await probeApiBase(base)) {
        resolvedApiBase = base;
        return base;
      }
    }
    // Final fallback keeps behavior predictable if health route is unavailable.
    resolvedApiBase = candidates[0];
    return resolvedApiBase;
  })();

  try {
    return await resolvingApiBase;
  } finally {
    resolvingApiBase = null;
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  const base = await resolveApiBase();
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    return parseApiError(res, fallbackErrorMessage);
  }
  return res.json() as Promise<T>;
}

/** Like `requestJson`, but parses text first so callers can normalize / log the raw envelope. */
export async function requestJsonParsed<T>(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
  parse: (raw: unknown) => T,
): Promise<T> {
  const base = await resolveApiBase();
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    return parseApiError(res, fallbackErrorMessage);
  }
  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${fallbackErrorMessage}: response was not valid JSON`);
  }
  return parse(raw);
}

export async function requestVoid(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<void> {
  const base = await resolveApiBase();
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    return parseApiError(res, fallbackErrorMessage);
  }
}
