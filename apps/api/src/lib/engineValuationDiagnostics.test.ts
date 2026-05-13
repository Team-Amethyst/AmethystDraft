import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { classifyAxiosLikeError, safeJsonByteLength } from "./engineValuationDiagnostics";

describe("engineValuationDiagnostics", () => {
  it("classifies axios timeout", () => {
    const err = new AxiosError("timeout", "ECONNABORTED");
    expect(classifyAxiosLikeError(err).classification).toBe("client_timeout");
  });

  it("classifies connection reset", () => {
    const err = new AxiosError("socket hang up", "ECONNRESET");
    expect(classifyAxiosLikeError(err).classification).toBe("connection_reset");
  });

  it("classifies Engine 5xx", () => {
    const err = new AxiosError("Bad Gateway", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 502,
      statusText: "Bad Gateway",
      data: { errors: [] },
      headers: {},
      config: {} as never,
    });
    expect(classifyAxiosLikeError(err).classification).toBe("engine_5xx");
    expect(classifyAxiosLikeError(err).engine_status).toBe(502);
  });

  it("measures JSON byte length", () => {
    expect(safeJsonByteLength({ a: "π" })).toBeGreaterThan(0);
  });
});
