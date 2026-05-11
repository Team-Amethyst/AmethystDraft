import { describe, it, expect, afterEach } from "vitest";
import { mongoConnectionOptionsFromEnv } from "./mongoConnectionOptions";

describe("mongoConnectionOptionsFromEnv", () => {
  const prev = process.env.MONGODB_MAX_POOL_SIZE;

  afterEach(() => {
    if (prev === undefined) delete process.env.MONGODB_MAX_POOL_SIZE;
    else process.env.MONGODB_MAX_POOL_SIZE = prev;
  });

  it("defaults maxPoolSize to 25 when unset", () => {
    delete process.env.MONGODB_MAX_POOL_SIZE;
    expect(mongoConnectionOptionsFromEnv().maxPoolSize).toBe(25);
  });

  it("respects MONGODB_MAX_POOL_SIZE", () => {
    process.env.MONGODB_MAX_POOL_SIZE = "10";
    expect(mongoConnectionOptionsFromEnv().maxPoolSize).toBe(10);
  });
});
