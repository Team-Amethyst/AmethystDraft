const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  return `${API_BASE}${path}`;
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
