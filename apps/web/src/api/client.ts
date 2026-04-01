const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

type ErrorShape = {
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export function buildApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function authHeaders(token?: string): Record<string, string> {
  if (!token) {
    return {
      "Content-Type": "application/json",
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseApiError(
  res: globalThis.Response,
  fallbackMessage: string,
): Promise<never> {
  let message = fallbackMessage;
  try {
    const data = (await res.json()) as ErrorShape;
    message = data.error?.message ?? data.message ?? fallbackMessage;
  } catch {
    // ignore parse failures and fall back to default message
  }
  throw new Error(message);
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  const res = await fetch(buildApiUrl(path), init);
  if (!res.ok) {
    return parseApiError(res, fallbackErrorMessage);
  }
  return res.json() as Promise<T>;
}

export async function requestVoid(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<void> {
  const res = await fetch(buildApiUrl(path), init);
  if (!res.ok) {
    return parseApiError(res, fallbackErrorMessage);
  }
}
