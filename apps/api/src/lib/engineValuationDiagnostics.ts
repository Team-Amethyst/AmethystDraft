import type { AxiosError } from "axios";

/** Set `LOG_ENGINE_VALUATION_DIAGNOSTICS=1` on the API for timing + payload counts on valuation routes. */
export function valuationDiagnosticsEnabled(): boolean {
  return process.env.LOG_ENGINE_VALUATION_DIAGNOSTICS === "1";
}

export function safeJsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return -1;
  }
}

/** Truncate JSON for logs; never include request config or auth headers. */
export function jsonSnippet(value: unknown, maxChars = 900): string {
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}…(truncated,len=${s.length})`;
  } catch {
    return "[unserializable]";
  }
}

export type AxiosLikeClassification =
  | "client_timeout"
  | "connection_reset"
  | "network_timeout"
  | "engine_4xx"
  | "engine_5xx"
  | "engine_other_status"
  | "no_response"
  | "non_axios";

export function classifyAxiosLikeError(err: unknown): {
  classification: AxiosLikeClassification;
  axios_code?: string;
  engine_status?: number;
  message_snippet?: string;
} {
  if (!err || typeof err !== "object") {
    return { classification: "non_axios", message_snippet: String(err).slice(0, 200) };
  }

  const e = err as Partial<AxiosError> & { code?: string; message?: string };
  const msg = (e.message ?? "").toLowerCase();
  const code = e.code;

  if (code === "ECONNABORTED" || msg.includes("timeout")) {
    return { classification: "client_timeout", axios_code: code, message_snippet: e.message?.slice(0, 200) };
  }
  if (code === "ECONNRESET") {
    return { classification: "connection_reset", axios_code: code, message_snippet: e.message?.slice(0, 200) };
  }
  if (code === "ETIMEDOUT" || code === "ENETUNREACH" || code === "EAI_AGAIN") {
    return { classification: "network_timeout", axios_code: code, message_snippet: e.message?.slice(0, 200) };
  }

  const status = e.response?.status;
  if (typeof status === "number") {
    if (status >= 500) {
      return {
        classification: "engine_5xx",
        engine_status: status,
        message_snippet: e.message?.slice(0, 200),
      };
    }
    if (status >= 400) {
      return {
        classification: "engine_4xx",
        engine_status: status,
        message_snippet: e.message?.slice(0, 200),
      };
    }
    return {
      classification: "engine_other_status",
      engine_status: status,
      message_snippet: e.message?.slice(0, 200),
    };
  }

  if (e.request && !e.response) {
    return { classification: "no_response", axios_code: code, message_snippet: e.message?.slice(0, 200) };
  }

  return {
    classification: "non_axios",
    axios_code: code,
    message_snippet: e.message?.slice(0, 200),
  };
}
