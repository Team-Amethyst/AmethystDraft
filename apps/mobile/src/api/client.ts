const API_BASE = "http://192.168.1.9:3001";

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
  res: Response,
  fallbackMessage: string,
): Promise<never> {
  let message = fallbackMessage;

  try {
    const data = (await res.json()) as ErrorShape;

    if (Array.isArray(data.errors) && data.errors.length > 0) {
      message = messageFromEngineValidation(data.errors);
    } else {
      message = data.error?.message ?? data.message ?? fallbackMessage;
    }
  } catch {
    // ignore parse failures
  }

  throw new Error(message);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  const url = buildApiUrl(path);

  console.log("API request:", url);

  let res: Response;

  try {
    res = await fetchWithTimeout(url, init);
  } catch (err) {
    console.log("API request failed:", err);
    throw new Error("Could not reach the API. Check that the backend is running and reachable.");
  }

  console.log("API response:", res.status, url);

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
  const url = buildApiUrl(path);

  console.log("API request:", url);

  let res: Response;

  try {
    res = await fetchWithTimeout(url, init);
  } catch (err) {
    console.log("API request failed:", err);
    throw new Error("Could not reach the API. Check that the backend is running and reachable.");
  }

  console.log("API response:", res.status, url);

  if (!res.ok) {
    return parseApiError(res, fallbackErrorMessage);
  }
}