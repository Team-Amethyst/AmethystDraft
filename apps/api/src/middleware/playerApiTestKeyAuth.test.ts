import { describe, it, expect, vi, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { playerApiTestKeyAuth } from "./playerApiTestKeyAuth";

function makeReq(headers: Record<string, string | undefined>): Request {
  return {
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

describe("playerApiTestKeyAuth", () => {
  const prev = process.env.PLAYER_API_TEST_KEY;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.PLAYER_API_TEST_KEY;
    } else {
      process.env.PLAYER_API_TEST_KEY = prev;
    }
    vi.restoreAllMocks();
  });

  it("responds 503 when PLAYER_API_TEST_KEY is not set", () => {
    delete process.env.PLAYER_API_TEST_KEY;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn() as NextFunction;
    const req = makeReq({});

    playerApiTestKeyAuth(req, { status, json } as unknown as Response, next);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "PLAYER_API_TESTING_DISABLED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 when key is missing or wrong", () => {
    process.env.PLAYER_API_TEST_KEY = "expected";
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn() as NextFunction;

    playerApiTestKeyAuth(makeReq({}), { status, json } as unknown as Response, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    vi.clearAllMocks();
    playerApiTestKeyAuth(
      makeReq({ "x-player-api-key": "wrong" }),
      { status, json } as unknown as Response,
      next,
    );
    expect(status).toHaveBeenCalledWith(401);
  });

  it("accepts x-player-api-key when it matches", () => {
    process.env.PLAYER_API_TEST_KEY = "secret";
    const next = vi.fn() as NextFunction;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;

    playerApiTestKeyAuth(
      makeReq({ "x-player-api-key": "secret" }),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("accepts Authorization Bearer when it matches", () => {
    process.env.PLAYER_API_TEST_KEY = "token";
    const next = vi.fn() as NextFunction;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;

    playerApiTestKeyAuth(
      makeReq({ authorization: "Bearer token" }),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("trims configured key and header values", () => {
    process.env.PLAYER_API_TEST_KEY = "  abc  ";
    const next = vi.fn() as NextFunction;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;

    playerApiTestKeyAuth(
      makeReq({ "x-player-api-key": " abc " }),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});
