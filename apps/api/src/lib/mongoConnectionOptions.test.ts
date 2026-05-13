import { describe, it, expect, afterEach } from "vitest";
import { mongoConnectionOptionsFromEnv } from "./mongoConnectionOptions";

describe("mongoConnectionOptionsFromEnv", () => {
  const prev = process.env.MONGODB_MAX_POOL_SIZE;

  afterEach(() => {
    if (prev === undefined) delete process.env.MONGODB_MAX_POOL_SIZE;
    else process.env.MONGODB_MAX_POOL_SIZE = prev;
  });

  it("defaults maxPoolSize to 10 when unset", () => {
    delete process.env.MONGODB_MAX_POOL_SIZE;
    const opts = mongoConnectionOptionsFromEnv();
    expect(opts.maxPoolSize).toBe(10);
    expect(opts.maxConnecting).toBe(2);
    expect(opts.maxIdleTimeMS).toBe(60_000);
    expect(opts.serverSelectionTimeoutMS).toBe(30_000);
  });

  it("respects MONGODB_MAX_POOL_SIZE", () => {
    process.env.MONGODB_MAX_POOL_SIZE = "10";
    expect(mongoConnectionOptionsFromEnv().maxPoolSize).toBe(10);
  });
});
