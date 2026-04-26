import { describe, it, expect, afterEach } from "vitest";
import { corsOptionsFromEnv } from "./corsConfig";

describe("corsOptionsFromEnv", () => {
  const orig = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (orig === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = orig;
  });

  it("allows localhost/127.0.0.1 dev origins when CORS_ORIGIN is unset", async () => {
    delete process.env.CORS_ORIGIN;
    const { origin } = corsOptionsFromEnv();
    expect(typeof origin).toBe("function");
    const fn = origin as (
      o: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;
    for (const url of [
      "http://localhost:5173",
      "http://localhost:5187",
      "http://127.0.0.1:5173",
    ]) {
      await new Promise<void>((resolve) => {
        fn(url, (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          resolve();
        });
      });
    }
    await new Promise<void>((resolve) => {
      fn("https://draftroom.uk", (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(false);
        resolve();
      });
    });
  });

  it("allows comma-separated origins including draftroom.uk", async () => {
    process.env.CORS_ORIGIN =
      "https://draftroom.uk/, https://www.draftroom.uk ,http://localhost:5173";
    const { origin } = corsOptionsFromEnv();
    const fn = origin as (
      o: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;
    for (const url of [
      "https://draftroom.uk",
      "https://www.draftroom.uk",
      "http://localhost:5173",
    ]) {
      await new Promise<void>((resolve) => {
        fn(url, (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          resolve();
        });
      });
    }
    await new Promise<void>((resolve) => {
      fn("https://evil.example", (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(false);
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      fn("http://localhost:5187", (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(true);
        resolve();
      });
    });
  });

  it("allows requests with no Origin header", async () => {
    process.env.CORS_ORIGIN = "https://draftroom.uk";
    const { origin } = corsOptionsFromEnv();
    const fn = origin as (
      o: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;
    await new Promise<void>((resolve) => {
      fn(undefined, (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(true);
        resolve();
      });
    });
  });
});
